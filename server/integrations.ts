import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db';
import type { ServerConfig } from './config';
import { DomainError, applyCommand } from '../src/platform/operations';
import { accessContextFor, can } from '../src/platform/permissions';
import { PLANS } from '../src/platform/plans';
import type { PlanId, Ticket } from '../src/platform/types';
import { addBusinessMinutes, addCalendarMonths, DEFAULT_SLA_TARGETS, defaultCalendar } from '../src/platform/sla';
import { hash, randomToken } from './security';
import { audit, enqueueEmail, loadDomain, persistDomain, afterDomainEffects } from './repository';

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) throw new DomainError('The external service is unavailable; retry safely', 'PROVIDER_UNAVAILABLE', 502);
  return await response.json() as Record<string, unknown>;
}
export async function deliverOutbox(db: Database, config: ServerConfig, limit = 25): Promise<{ sent: number; failed: number }> {
  const messages = await db.transaction(async tx => {
    const r = await tx.query<{ id: string; recipient: string; subject: string; body: string; attempts: number }>("SELECT id,recipient,subject,body,attempts FROM outbox WHERE (status='pending' AND next_attempt_at<=now()) OR (status='processing' AND locked_at<now()-interval '10 minutes') ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED", [limit]);
    for (const m of r.rows) await tx.query("UPDATE outbox SET status='processing',locked_at=now(),attempts=attempts+1 WHERE id=$1", [m.id]); return r.rows;
  });
  let sent = 0, failed = 0;
  for (const m of messages) {
    try {
      if (config.testEmailSink) config.testEmailSink.push({ to: m.recipient, subject: m.subject, text: m.body });
      else {
        if (!config.emailKey || !config.emailFrom) throw new Error('EMAIL_NOT_CONFIGURED');
        await fetchJson('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.emailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.id }, body: JSON.stringify({ from: config.emailFrom, to: [m.recipient], subject: m.subject, text: m.body }) });
      }
      await db.query("UPDATE outbox SET status='sent',sent_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1", [m.id]); sent++;
    } catch (error) {
      const code = error instanceof Error && error.message === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'DELIVERY_FAILED';
      await db.query("UPDATE outbox SET status=$2,locked_at=NULL,last_error=$3,next_attempt_at=now()+($4::text||' seconds')::interval WHERE id=$1", [m.id, m.attempts >= 8 ? 'failed' : 'pending', code, Math.min(3600, 60 * 2 ** m.attempts)]); failed++;
    }
  }
  return { sent, failed };
}
const PAYSTACK = 'https://api.paystack.co';
export async function initializeCheckout(db: Database, config: ServerConfig, reference: string): Promise<string> {
  if (!config.paystackKey) throw new DomainError('Paystack is not configured', 'BILLING_NOT_CONFIGURED', 503);
  const r = await db.query<{ recipient: string; expected_amount: string; kind: string; entity_id: string; tenant_id: string }>('SELECT c.*,u.email AS recipient FROM checkouts c JOIN users u ON u.id=c.created_by WHERE c.reference=$1', [reference]);
  const checkout = r.rows[0]; if (!checkout) throw new DomainError('Checkout not found', 'NOT_FOUND', 404);
  try {
    const response = await fetchJson(`${PAYSTACK}/transaction/initialize`, { method: 'POST', headers: { Authorization: `Bearer ${config.paystackKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      email: checkout.recipient, amount: Number(checkout.expected_amount), currency: 'NGN', reference,
      callback_url: `${config.appUrl}/app/admin?billing=verify&reference=${encodeURIComponent(reference)}`,
      metadata: { checkout_reference: reference, tenant_id: checkout.tenant_id, kind: checkout.kind, entity_id: checkout.entity_id, cancel_action: `${config.appUrl}/app/admin?billing=cancelled` },
    }) });
    const data = response.data as { authorization_url?: string } | undefined;
    if (!data?.authorization_url || !data.authorization_url.startsWith('https://checkout.paystack.com/')) throw new Error('Invalid provider response');
    return data.authorization_url;
  } catch (error) { await db.query("UPDATE checkouts SET status='expired' WHERE reference=$1 AND status='pending'", [reference]); throw error; }
}
export async function settleCheckout(db: Database, config: ServerConfig, reference: string): Promise<{ status: string }> {
  if (!config.paystackKey) throw new DomainError('Paystack is not configured', 'BILLING_NOT_CONFIGURED', 503);
  const response = await fetchJson(`${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${config.paystackKey}` } });
  const data = response.data as { status?: string; amount?: number; currency?: string; reference?: string; metadata?: { checkout_reference?: string } } | undefined;
  if (!data || data.status !== 'success') return { status: 'pending' };
  return db.transaction(async tx => {
    const r = await tx.query<{ reference: string; tenant_id: string; kind: 'subscription' | 'invoice'; entity_id: string; expected_amount: string; currency: string; status: string; created_by: string }>('SELECT * FROM checkouts WHERE reference=$1 FOR UPDATE', [reference]); const c = r.rows[0];
    if (!c) throw new DomainError('Unknown checkout reference', 'INVALID_PAYMENT', 400);
    if (c.status === 'paid') return { status: 'paid' };
    if (data.reference !== reference || data.amount !== Number(c.expected_amount) || data.currency !== c.currency || data.metadata?.checkout_reference !== reference) throw new DomainError('Payment verification mismatch', 'INVALID_PAYMENT', 400);
    const tenant = await tx.query<{ data: import('../src/platform/types').Tenant }>('SELECT data FROM tenants WHERE id=$1 FOR UPDATE', [c.tenant_id]); const t = tenant.rows[0].data; const now = new Date().toISOString();
    if (c.kind === 'subscription') {
      const plan = c.entity_id as PlanId; if (!PLANS[plan] || PLANS[plan].monthlyNgn * 100 !== Number(c.expected_amount)) throw new DomainError('Invalid plan amount', 'INVALID_PAYMENT', 400);
      t.plan = plan; t.subscriptionStatus = 'active'; t.subscriptionExpiresAt = new Date(Date.now() + 32 * 86400000).toISOString();
      await tx.query('UPDATE tenants SET data=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1', [t.id, JSON.stringify(t)]);
    } else {
      const inv = await tx.query<{ data: import('../src/platform/types').Invoice }>("SELECT data FROM records WHERE tenant_id=$1 AND id=$2 AND kind='invoices' FOR UPDATE", [t.id, c.entity_id]); const i = inv.rows[0]?.data;
      if (!i || ['draft', 'cancelled', 'paid'].includes(i.status)) throw new DomainError('Invoice cannot accept this payment', 'INVALID_PAYMENT', 400);
      const { invoiceBalanceKobo } = await import('../src/platform/money'); const amount = invoiceBalanceKobo(i) / 100;
      if (Number(c.expected_amount) !== invoiceBalanceKobo(i)) throw new DomainError('Invoice balance changed; start a new checkout', 'CONFLICT', 409);
      i.payments = [...(i.payments ?? []), { id: crypto.randomUUID(), amount, method: 'paystack', reference, recordedBy: c.created_by, at: now }]; i.status = 'paid'; i.paidAt = now; i.checkoutReference = reference;
      await tx.query('UPDATE records SET data=$2::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$3', [t.id, JSON.stringify(i), i.id]);
    }
    await tx.query("UPDATE checkouts SET status='paid',paid_at=now() WHERE reference=$1", [reference]);
    await audit(tx, { tenantId: t.id, actorId: c.created_by, actorName: 'Paystack verification', action: 'billing.payment_verified', entity: c.kind, entityId: c.entity_id, summary: `Verified ${c.currency} payment ${reference}` });
    return { status: 'paid' };
  });
}
export async function paystackWebhook(db: Database, config: ServerConfig, raw: string, signature: string | null): Promise<void> {
  if (!config.paystackKey || !signature) throw new DomainError('Webhook authentication failed', 'UNAUTHORIZED', 401);
  const expected = createHmac('sha512', config.paystackKey).update(raw).digest('hex');
  if (!/^[a-f0-9]{128}$/.test(signature) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) throw new DomainError('Webhook authentication failed', 'UNAUTHORIZED', 401);
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; id?: string | number } };
  const eventId = String(event.data?.id ?? hash(raw)); const reference = event.data?.reference ?? null;
  const inserted = await db.query('INSERT INTO payment_events(provider,event_id,reference,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(provider,event_id) DO NOTHING RETURNING event_id', ['paystack', eventId, reference, raw]);
  if (!inserted.rows.length) return;
  if (event.event !== 'charge.success' || !reference) { await db.query("UPDATE payment_events SET status='ignored',processed_at=now() WHERE provider='paystack' AND event_id=$1", [eventId]); return; }
  try { await settleCheckout(db, config, reference); await db.query("UPDATE payment_events SET status='processed',processed_at=now() WHERE provider='paystack' AND event_id=$1", [eventId]); }
  catch (error) { await db.query("UPDATE payment_events SET status='failed',last_error=$2 WHERE provider='paystack' AND event_id=$1", [eventId, error instanceof DomainError ? error.code : 'VERIFICATION_FAILED']); throw error; }
}
export const telemetrySchema = z.object({ status: z.enum(['up', 'degraded', 'down']), latencyMs: z.number().min(0).max(60000), packetLossPct: z.number().min(0).max(100), cpuPct: z.number().min(0).max(100).optional(), memPct: z.number().min(0).max(100).optional(), storagePct: z.number().min(0).max(100).optional() }).strict();
export async function issueDeviceToken(tx: Database, tenantId: string, deviceId: string): Promise<string> {
  const token = randomToken(); await tx.query('INSERT INTO device_credentials(tenant_id,device_id,token_hash) VALUES($1,$2,$3) ON CONFLICT(tenant_id,device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash', [tenantId, deviceId, hash(token)]); return token;
}
async function nextTicketNumber(tx: Database, tenantId: string): Promise<string> {
  const r = await tx.query<{ value: string }>("INSERT INTO counters(tenant_id,kind,value) VALUES($1,'ticket',1001) ON CONFLICT(tenant_id,kind) DO UPDATE SET value=counters.value+1 RETURNING value", [tenantId]); return `TKT-${r.rows[0].value}`;
}
export async function ingestTelemetry(db: Database, input: { tenantId: string; deviceId: string; token: string; eventId: string; metrics: z.infer<typeof telemetrySchema> }): Promise<{ deduped: boolean }> {
  return db.transaction(async tx => {
    const cred = await tx.query<{ token_hash: string }>('SELECT token_hash FROM device_credentials WHERE tenant_id=$1 AND device_id=$2', [input.tenantId, input.deviceId]);
    if (!cred.rows[0] || cred.rows[0].token_hash.trim() !== hash(input.token)) throw new DomainError('Device authentication failed', 'UNAUTHORIZED', 401);
    const inserted = await tx.query('INSERT INTO ingestion_events(tenant_id,device_id,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id', [input.tenantId, input.deviceId, input.eventId]);
    if (!inserted.rows.length) return { deduped: true };
    const r = await tx.query<{ data: import('../src/platform/types').Device }>("SELECT data FROM records WHERE tenant_id=$1 AND id=$2 AND kind='devices' FOR UPDATE", [input.tenantId, input.deviceId]); const device = r.rows[0]?.data;
    if (!device || !device.monitored) throw new DomainError('Device is not monitored', 'NOT_FOUND', 404);
    const now = new Date().toISOString(); Object.assign(device, input.metrics, { lastSeenAt: now });
    await tx.query('UPDATE records SET data=$2::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$3', [input.tenantId, JSON.stringify(device), device.id]);
    const active = await tx.query<{ id: string; data: import('../src/platform/types').Alert }>("SELECT id,data FROM records WHERE tenant_id=$1 AND kind='alerts' AND data->>'deviceId'=$2::text AND data->>'status'<>'resolved' FOR UPDATE", [input.tenantId, device.id]);
    if (device.status === 'down' && !active.rows.length) {
      const policy = await tx.query<{ data: import('../src/platform/types').SlaPolicy }>("SELECT data FROM records WHERE tenant_id=$1 AND kind='slaPolicies' LIMIT 1", [input.tenantId]); const cal = policy.rows[0]?.data ?? { ...defaultCalendar(), timezone: 'Africa/Lagos' };
      const ticket: Ticket = { id: crypto.randomUUID(), tenantId: input.tenantId, number: await nextTicketNumber(tx, input.tenantId), kind: 'incident', title: `Infrastructure outage: ${device.name}`, description: 'Authenticated monitoring agent reported the device unreachable.', category: 'Network & connectivity', requesterId: 'system', branchId: device.branchId, impact: 'high', urgency: 'high', priority: 'critical', priorityOverridden: false, status: 'new', slaPolicyId: policy.rows[0]?.data.id, responseDueAt: addBusinessMinutes(now, (cal.targets ?? DEFAULT_SLA_TARGETS).critical.response, cal), resolveDueAt: addBusinessMinutes(now, (cal.targets ?? DEFAULT_SLA_TARGETS).critical.resolve, cal), source: 'monitoring', createdAt: now, updatedAt: now };
      await tx.query('INSERT INTO records(tenant_id,id,kind,data) VALUES($1,$2,$3,$4::jsonb)', [input.tenantId, ticket.id, 'tickets', JSON.stringify(ticket)]);
      const alert = { id: crypto.randomUUID(), tenantId: input.tenantId, deviceId: device.id, severity: 'critical', message: `${device.name} is unreachable`, status: 'active', incidentId: ticket.id, createdAt: now };
      await tx.query('INSERT INTO records(tenant_id,id,kind,data) VALUES($1,$2,$3,$4::jsonb)', [input.tenantId, alert.id, 'alerts', JSON.stringify(alert)]);
      await audit(tx, { tenantId: input.tenantId, actorName: 'Monitoring agent', action: 'monitoring.outage', entity: 'device', entityId: device.id, summary: `Alert and incident created for ${device.name}` });
    } else if (device.status === 'up') for (const a of active.rows) {
      const value = { ...a.data, status: 'resolved', resolvedAt: now }; await tx.query('UPDATE records SET data=$2::jsonb WHERE tenant_id=$1 AND id=$3', [input.tenantId, JSON.stringify(value), a.id]);
      await audit(tx, { tenantId: input.tenantId, actorName: 'Monitoring agent', action: 'monitoring.recovered', entity: 'alert', entityId: a.id, summary: 'Recovery telemetry resolved the alert' });
    }
    await tx.query('UPDATE tenants SET revision=revision+1 WHERE id=$1', [input.tenantId]); return { deduped: false };
  });
}
export async function runScheduledWork(db: Database, config: ServerConfig): Promise<{ tenants: number; jobs: number }> {
  const tenants = await db.query<{ id: string }>("SELECT id FROM tenants WHERE data->>'status'='active' ORDER BY id LIMIT 200"); let jobs = 0; const today = new Date().toISOString().slice(0, 10);
  for (const { id } of tenants.rows) {
    await db.transaction(async tx => {
      const loaded = await loadDomain(tx, id, '00000000-0000-0000-0000-000000000000', { lock: true }); const d = loaded.data;
      const owner = d.memberships.find(m => m.status === 'active' && ['org_owner', 'org_admin', 'svc_delivery_manager'].includes(m.role)); if (!owner) return;
      const ctx = accessContextFor(d.memberships, owner.userId, id, undefined, []); if (!ctx) return;
      const before = structuredClone(d); const now = new Date().toISOString(); let changed = false;
      const once = async (key: string, fn: () => Promise<void> | void) => { const r = await tx.query('INSERT INTO jobs(id,tenant_id,kind,dedupe_key,status,completed_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id', [crypto.randomUUID(), id, 'reminder', key, 'completed']); if (r.rows.length) { await fn(); jobs++; changed = true; } };
      if (can(ctx, 'maintenance.plan.manage') && d.maintenancePlans.some(p => p.active && Date.parse(p.nextRunAt) <= Date.now())) { applyCommand(d, ctx, { type: 'maintenance.run' }); changed = true; jobs++; }
      const managers = d.memberships.filter(m => m.status === 'active' && ['org_owner', 'org_admin', 'it_manager', 'svc_delivery_manager'].includes(m.role));
      const notify = (title: string, body: string, link: string) => { for (const m of managers) d.notifications.unshift({ id: crypto.randomUUID(), tenantId: id, userId: m.userId, title, body, link, read: false, at: now }); };
      for (const t of d.tickets.filter(t => !['resolved', 'closed'].includes(t.status))) for (const kind of ['response', 'resolve'] as const) {
        const due = kind === 'response' ? t.responseDueAt : t.resolveDueAt; const done = kind === 'response' ? t.firstResponseAt : t.resolvedAt;
        if (due && !done && Date.parse(due) < Date.now()) await once(`sla:${t.id}:${kind}:${due}`, () => notify(`SLA breached: ${t.number}`, `${kind} target passed. Escalate and document the cause.`, `/app/service-desk/${t.id}`));
      }
      for (const a of d.assets.filter(a => a.warrantyExpiry && Date.parse(a.warrantyExpiry) - Date.now() < 30 * 86400000 && !['disposed', 'retired'].includes(a.lifecycle))) await once(`warranty:${a.id}:${today}`, () => notify('Warranty review', `${a.tag} · ${a.name}`, `/app/assets/${a.id}`));
      for (const doc of d.documents.filter(x => x.expiresAt && Date.parse(x.expiresAt) - Date.now() < 45 * 86400000)) await once(`document:${doc.id}:${today}`, () => notify('Document review due', doc.title, '/app/docs'));
      for (const schedule of d.reportSchedules.filter(s => s.active && Date.parse(s.nextRunAt) <= Date.now())) {
        await once(`report:${schedule.id}:${schedule.nextRunAt}`, async () => { for (const to of schedule.recipients) await enqueueEmail(tx, { tenantId: id, dedupe: `report:${schedule.id}:${schedule.nextRunAt}:${to}`, to, subject: schedule.name, text: `Your scheduled ${schedule.reportId} report is ready. Open the authorised workspace report with the saved schedule parameters:\n${config.appUrl}/app/reports?report=${schedule.reportId}&from=${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}&to=${encodeURIComponent(now)}\n\nAccess is checked when the report is opened.` }); });
        schedule.nextRunAt = schedule.cadence === 'monthly' ? addCalendarMonths(schedule.nextRunAt, 1) : new Date(Date.parse(schedule.nextRunAt) + (schedule.cadence === 'daily' ? 1 : 7) * 86400000).toISOString();
      }
      const tenant = d.tenants.find(t => t.id === id)!;
      if (tenant.subscriptionStatus === 'active' && tenant.subscriptionExpiresAt && Date.parse(tenant.subscriptionExpiresAt) < Date.now()) { tenant.subscriptionStatus = 'past_due'; changed = true; await once(`subscription-expired:${id}:${tenant.subscriptionExpiresAt}`, () => notify('Subscription renewal required', 'The prepaid subscription period has ended. Operational writes are paused; exports remain available.', '/app/admin')); }
      if (changed) { d.auditLogs.unshift({ id: crypto.randomUUID(), tenantId: id, actorId: owner.userId, actorName: 'Scheduler', action: 'automation.scheduled_work', entity: 'tenant', entityId: id, summary: 'Idempotent maintenance, SLA, review and report jobs processed', at: now }); await persistDomain(tx, before, d, id); await afterDomainEffects(tx, before, d, id, config.appUrl); }
    });
  }
  await db.query("DELETE FROM sessions WHERE expires_at<now()-interval '1 day'");
  await db.query("DELETE FROM auth_tokens WHERE expires_at<now()-interval '1 day'");
  await db.query("DELETE FROM rate_limits WHERE window_start<now()-interval '2 days'");
  await db.query("DELETE FROM ingestion_events WHERE received_at<now()-interval '7 days'");
  await db.query("DELETE FROM outbox WHERE status='sent' AND sent_at<now()-interval '30 days'");
  return { tenants: tenants.rows.length, jobs };
}

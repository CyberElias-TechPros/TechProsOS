// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { embeddedDatabase, migrate, type Database } from '../server/db';
import { handleApi } from '../server/api';
import type { ServerConfig } from '../server/config';
import { deliverOutbox } from '../server/integrations';
import { hash } from '../server/security';
import type { DataSet } from '../src/platform/types';

let db: Database;
const sink: NonNullable<ServerConfig['testEmailSink']> = [];
const config: ServerConfig = { mode: 'live', appUrl: 'https://app.test', databaseUrl: 'embedded-test', encryptionKey: Buffer.alloc(32, 7), cronSecret: 'test-cron-secret-'.padEnd(40, 'x'), paystackKey: 'test-paystack-key-not-real', secureCookies: true, testEmailSink: sink };
const origin = 'https://app.test';
async function call(path: string, method = 'GET', body?: unknown, session?: { cookie: string; csrf: string }, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { Origin: origin, ...headers };
  if (session) { h.Cookie = session.cookie; h['X-CSRF-Token'] = session.csrf; }
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return handleApi(new Request(`${origin}${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), { db, config, clientIp: '198.51.100.10' });
}
async function data(res: Response) { return await res.json() as Record<string, any>; }
function sessionFrom(res: Response) { const cookies = res.headers.getSetCookie(); return { cookie: cookies.map(c => c.split(';')[0]).join('; '), csrf: cookies.find(c => c.startsWith('tp_csrf='))!.split(';')[0].split('=')[1] }; }
const registration = (email: string, orgName: string) => ({ orgName, industry: 'Technology', city: 'Lagos', plan: 'professional', type: 'organisation', ownerName: 'Test Owner', ownerEmail: email, ownerPhone: '+2348000000000', password: 'Correct-Horse-Battery-42', branches: [{ name: 'HQ', city: 'Lagos' }], departments: ['ICT'], consent: true });
async function registerAndVerify(email: string, org: string) {
  const res = await call('/api/auth/register', 'POST', registration(email, org)); expect(res.status).toBe(202);
  await deliverOutbox(db, config); const mail = [...sink].reverse().find(m => m.to === email && m.subject.includes('Verify'))!; expect(mail).toBeTruthy();
  const token = new URL(mail.text.match(/https:\/\/app\.test\/verify-email\?token=[a-f0-9]{64}/)![0]).searchParams.get('token');
  const verified = await call('/api/auth/verify-email', 'POST', { token }); expect(verified.status).toBe(200);
  return { session: sessionFrom(verified), ...(await data(verified)) as { tenantId: string; user: { id: string } } };
}
async function workspace(session: { cookie: string; csrf: string }) { const res = await call('/api/workspace', 'GET', undefined, session); expect(res.status).toBe(200); return await data(res) as { data: DataSet; revision: number }; }
async function command(session: { cookie: string; csrf: string }, body: unknown, revision?: number) {
  const rev = revision ?? (await workspace(session)).revision; return call('/api/commands', 'POST', { revision: rev, command: body }, session);
}
let owner: Awaited<ReturnType<typeof registerAndVerify>>;
let employee: { session: { cookie: string; csrf: string }; tenantId: string; user: { id: string } };
let ticketId: string;
beforeAll(async () => { db = await embeddedDatabase(); await migrate(db); owner = await registerAndVerify('owner@example.test', 'Owner Workspace'); }, 30000);
afterAll(async () => { await db?.close(); vi.unstubAllGlobals(); });

describe('live API on the PostgreSQL engine', () => {
  it('fails closed without configuration and never exposes secrets', async () => {
    const res = await handleApi(new Request('https://app.test/api/workspace'), { config: { ...config, databaseUrl: undefined } }); expect(res.status).toBe(503); expect(await res.text()).not.toContain('test-cron');
  });
  it('provisions an empty workspace, not demo data, and requires email verification', async () => {
    const w = await workspace(owner.session); expect(w.data.tenants).toHaveLength(1); expect(w.data.tickets).toHaveLength(0); expect(w.data.assets).toHaveLength(0); expect(w.data.branches).toHaveLength(1);
    expect((await db.query('SELECT password_hash FROM users')).rows[0].password_hash).toMatch(/^scrypt\$32768/);
    expect((await call('/api/auth/login', 'POST', { email: 'owner@example.test', password: 'wrong-password' })).status).toBe(401);
  });
  it('rejects missing origin, missing CSRF and browser-supplied identity fields', async () => {
    const res = await handleApi(new Request(`${origin}/api/commands`, { method: 'POST', headers: { Cookie: owner.session.cookie, 'X-CSRF-Token': owner.session.csrf, 'Content-Type': 'application/json' }, body: '{}' }), { db, config }); expect(res.status).toBe(403);
    expect((await call('/api/commands', 'POST', { revision: 0, command: { type: 'branch.create', name: 'X', city: 'Lagos' } }, { ...owner.session, csrf: 'wrong' })).status).toBe(403);
    expect((await command(owner.session, { type: 'ticket.create', userId: owner.user.id, input: {} })).status).toBe(422);
  });
  it('creates tickets transactionally and detects stale revisions', async () => {
    const input = { kind: 'incident', title: 'Printer offline', description: 'The front desk printer is unreachable.', category: 'Hardware', impact: 'medium', urgency: 'medium' };
    const res = await command(owner.session, { type: 'ticket.create', input }); expect(res.status).toBe(200); ticketId = (await data(res)).result.id;
    const w = await workspace(owner.session); expect(w.data.tickets[0].id).toBe(ticketId); expect(w.data.auditLogs.some(a => a.action === 'ticket.create')).toBe(true);
    const results = await Promise.all([command(owner.session, { type: 'branch.create', name: 'Ikeja', city: 'Lagos' }, w.revision), command(owner.session, { type: 'branch.create', name: 'Abuja', city: 'Abuja' }, w.revision)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]); expect((await workspace(owner.session)).data.branches).toHaveLength(2);
  });
  it('invites a recipient by email; only the token holder can accept', async () => {
    const invited = await command(owner.session, { type: 'user.invite', name: 'Test Employee', email: 'employee@example.test', role: 'employee' }); expect(invited.status).toBe(200);
    await deliverOutbox(db, config); const mail = [...sink].reverse().find(m => m.to === 'employee@example.test')!; const token = new URL(mail.text.match(/https:\/\/app\.test\/accept-invitation\?token=[a-f0-9]{64}/)![0]).searchParams.get('token');
    expect((await call('/api/auth/accept-invitation', 'POST', { token, name: 'Imposter', password: 'Another-Password-42' }, owner.session)).status).toBe(401);
    const accepted = await call('/api/auth/accept-invitation', 'POST', { token, name: 'Test Employee', password: 'Employee-Password-42' }); expect(accepted.status).toBe(200);
    employee = { session: sessionFrom(accepted), ...(await data(accepted)) as { tenantId: string; user: { id: string } } };
    expect((await call('/api/auth/accept-invitation', 'POST', { token, name: 'Test Employee', password: 'Employee-Password-42' })).status).toBe(400);
  });
  it('projects employee tickets and removes internal notes on the server', async () => {
    const created = await command(employee.session, { type: 'ticket.create', input: { kind: 'request', title: 'Need an account', description: 'Please create my learning portal account.', category: 'Access', impact: 'low', urgency: 'low' } }); expect(created.status).toBe(200); const ownId = (await data(created)).result.id;
    expect((await command(owner.session, { type: 'ticket.message', ticketId: ownId, body: 'Staff-only investigation', internal: true })).status).toBe(200);
    const w = await workspace(employee.session); expect(w.data.tickets.map(t => t.id)).toEqual([ownId]); expect(w.data.ticketMessages.some(m => m.internal)).toBe(false); expect(w.data.invoices).toHaveLength(0); expect(w.data.auditLogs).toHaveLength(0);
    expect((await command(employee.session, { type: 'invoice.create', clientName: 'X', items: [{ desc: 'Service', qty: 1, unitPrice: 100 }], whtRate: 0, dueDays: 7 })).status).toBe(403);
  });
  it('isolates a second tenant on reads and mutations', async () => {
    const other = await registerAndVerify('other@example.test', 'Other Workspace');
    expect((await workspace(other.session)).data.tickets).toHaveLength(0);
    expect((await command(other.session, { type: 'ticket.message', ticketId, body: 'cross-tenant attempt', internal: false })).status).toBe(404);
    expect((await call('/api/auth/switch', 'POST', { tenantId: owner.tenantId }, other.session)).status).toBe(403);
  });
  it('enforces purchase approval separation and exactly-once receiving', async () => {
    const vendor = await command(owner.session, { type: 'vendor.create', name: 'Test Vendor', category: 'Hardware', contact: 'Sales', email: 'sales@example.test', phone: '' }); const vendorId = (await data(vendor)).result.id;
    const branchId = (await workspace(owner.session)).data.branches[0].id;
    const po = await command(owner.session, { type: 'po.create', vendorId, branchId, items: [{ name: 'Cables', qty: 3, unitCost: 1000, kind: 'consumable' }] }); const poId = (await data(po)).result.id;
    expect((await command(owner.session, { type: 'po.status', id: poId, status: 'received' })).status).toBe(409);
    expect((await command(owner.session, { type: 'po.status', id: poId, status: 'approved' })).status).toBe(422);
    // A second owner is the independent approver.
    await db.query("UPDATE memberships SET role='org_owner' WHERE user_id=$1", [employee.user.id]);
    expect((await command(employee.session, { type: 'po.status', id: poId, status: 'approved' })).status).toBe(200);
    await db.query("UPDATE memberships SET role='employee' WHERE user_id=$1", [employee.user.id]);
    expect((await command(owner.session, { type: 'po.status', id: poId, status: 'ordered' })).status).toBe(200);
    expect((await command(owner.session, { type: 'po.status', id: poId, status: 'received', receivedBranchId: branchId })).status).toBe(200);
    expect((await command(owner.session, { type: 'po.status', id: poId, status: 'received', receivedBranchId: branchId })).status).toBe(409);
    expect((await workspace(owner.session)).data.stockItems.find(s => s.name === 'Cables')?.qty).toBe(3);
  });
  it('records partial settlement and verifies Paystack webhooks idempotently', async () => {
    const created = await command(owner.session, { type: 'invoice.create', clientName: 'Client Ltd', items: [{ desc: 'Support', qty: 2, unitPrice: 1000.25 }], vatRate: .075, whtRate: 0, dueDays: 14 }); const invoiceId = (await data(created)).result.id;
    expect((await command(owner.session, { type: 'invoice.status', id: invoiceId, status: 'sent' })).status).toBe(200);
    expect((await command(owner.session, { type: 'payment.record', invoiceId, amount: 100, method: 'bank_transfer', reference: 'BANK-001' })).status).toBe(200);
    expect((await workspace(owner.session)).data.invoices.find(i => i.id === invoiceId)?.status).toBe('partial');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/transaction/initialize')) return new Response(JSON.stringify({ data: { authorization_url: 'https://checkout.paystack.com/test' } }));
      const reference = decodeURIComponent(String(url).split('/transaction/verify/')[1]); const row = (await db.query<{ expected_amount: string; tenant_id: string; kind: string; entity_id: string }>('SELECT * FROM checkouts WHERE reference=$1', [reference])).rows[0];
      return new Response(JSON.stringify({ data: { status: 'success', amount: Number(row.expected_amount), currency: 'NGN', reference, metadata: { checkout_reference: reference, tenant_id: row.tenant_id, kind: row.kind, entity_id: row.entity_id } } }));
    }));
    const checkout = await call('/api/invoices/checkout', 'POST', { id: invoiceId }, owner.session); expect(checkout.status).toBe(200); const reference = (await data(checkout)).reference;
    const raw = JSON.stringify({ event: 'charge.success', data: { id: 'event-invoice-1', reference } }); const signature = createHmac('sha512', config.paystackKey!).update(raw).digest('hex');
    expect((await call('/api/webhooks/paystack', 'POST', raw, undefined, { 'X-Paystack-Signature': signature })).status).toBe(200);
    expect((await call('/api/webhooks/paystack', 'POST', raw, undefined, { 'X-Paystack-Signature': signature })).status).toBe(200);
    const invoice = (await workspace(owner.session)).data.invoices.find(i => i.id === invoiceId)!; expect(invoice.status).toBe('paid'); expect(invoice.payments).toHaveLength(2);
    expect((await call('/api/webhooks/paystack', 'POST', raw, undefined, { 'X-Paystack-Signature': '0'.repeat(128) })).status).toBe(401);
    const plan = await call('/api/billing/checkout', 'POST', { plan: 'business' }, owner.session); const planRef = (await data(plan)).reference;
    const planRaw = JSON.stringify({ event: 'charge.success', data: { id: 'event-plan-1', reference: planRef } });
    expect((await call('/api/webhooks/paystack', 'POST', planRaw, undefined, { 'X-Paystack-Signature': createHmac('sha512', config.paystackKey!).update(planRaw).digest('hex') })).status).toBe(200);
    expect((await workspace(owner.session)).data.tenants[0].plan).toBe('business'); vi.unstubAllGlobals();
  });
  it('authenticates monitoring agents, deduplicates outages and accepts recovery', async () => {
    const branchId = (await workspace(owner.session)).data.branches[0].id;
    const created = await command(owner.session, { type: 'device.create', name: 'Test router', kind: 'router', model: 'RB5009', ip: '192.0.2.1', branchId, monitored: true }); const body = await data(created); const deviceId = body.result.id, token = body.result.deviceToken; expect(token).toMatch(/^[a-f0-9]{64}$/);
    const send = (status: string, eventId: string) => call('/api/integrations/monitoring', 'POST', { status, latencyMs: 0, packetLossPct: status === 'down' ? 100 : 0 }, undefined, { Authorization: `Bearer ${token}`, 'X-Tenant-Id': owner.tenantId, 'X-Device-Id': deviceId, 'X-Event-Id': eventId });
    expect((await send('down', 'outage-1')).status).toBe(200); expect((await send('down', 'outage-1')).status).toBe(200);
    let w = await workspace(owner.session); expect(w.data.alerts.filter(a => a.deviceId === deviceId)).toHaveLength(1); expect(w.data.tickets.filter(t => t.source === 'monitoring')).toHaveLength(1);
    expect((await send('up', 'recovery-1')).status).toBe(200); w = await workspace(owner.session); expect(w.data.alerts.find(a => a.deviceId === deviceId)?.status).toBe('resolved'); expect(w.data.devices.find(d => d.id === deviceId)?.status).toBe('up');
  });
  it('validates attachment content and scopes downloads', async () => {
    const upload = await call('/api/attachments', 'POST', { entityId: ticketId, name: 'note.txt', mime: 'text/plain', contentBase64: Buffer.from('Validated text evidence').toString('base64') }, owner.session); expect(upload.status).toBe(201); const id = (await data(upload)).id;
    expect((await call(`/api/attachments/${id}`, 'GET', undefined, owner.session)).status).toBe(200);
    expect((await call(`/api/attachments/${id}`, 'GET', undefined, employee.session)).status).toBe(404);
    expect((await call('/api/attachments', 'POST', { entityId: ticketId, name: 'fake.png', mime: 'image/png', contentBase64: Buffer.from('not a png').toString('base64') }, owner.session)).status).toBe(422);
  });
  it('runs scheduled maintenance idempotently and delivers the outbox', async () => {
    const branchId = (await workspace(owner.session)).data.branches[0].id;
    await command(owner.session, { type: 'asset.create', input: { name: 'Lab PC', category: 'Lab', manufacturer: 'HP', model: 'Elite', serial: 'LAB-001', branchId, purchaseDate: '2026-01-01', purchaseCost: 500000, usefulLifeYears: 4 } });
    await command(owner.session, { type: 'maintenance.plan', name: 'Monthly lab check', assetCategory: 'Lab', intervalMonths: 1, checklist: ['Clean filters'], assigneeId: owner.user.id, nextRunAt: '2026-01-01T08:00:00Z' });
    const cron = () => call('/api/cron/run', 'POST', undefined, undefined, { Authorization: `Bearer ${config.cronSecret}` });
    expect((await cron()).status).toBe(200); const count = (await workspace(owner.session)).data.workOrders.length; expect(count).toBeGreaterThan(0);
    expect((await cron()).status).toBe(200); expect((await workspace(owner.session)).data.workOrders.length).toBe(count);
    expect((await call('/api/cron/run', 'POST')).status).toBe(401);
  });
  it('enrolls MFA, requires it at login, and supports single-use recovery reset', async () => {
    const base = Math.floor(Date.now() / 30000) * 30000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      const setup = await call('/api/account/mfa/setup', 'POST', { password: 'Correct-Horse-Battery-42' }, owner.session); expect(setup.status).toBe(200); const { secret } = await data(setup);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, acc = 0; const bytes: number[] = []; for (const c of secret) { acc = (acc << 5) | alphabet.indexOf(c); bits += 5; if (bits >= 8) { bytes.push((acc >>> (bits - 8)) & 255); bits -= 8; } }
      const codeAt = (step: number) => { const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(); const offset = digest[digest.length - 1] & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0'); };
      const step = base / 30000; const code = codeAt(step);
      const enabled = await call('/api/account/mfa/enable', 'POST', { code }, owner.session); expect(enabled.status).toBe(200); const recovery = (await data(enabled)).recoveryCodes[0];
      clock.mockReturnValue((step + 1) * 30000);
      const challenged = await call('/api/auth/login', 'POST', { email: 'owner@example.test', password: 'Correct-Horse-Battery-42' }); const challenge = (await data(challenged)).challenge; expect(challenge).toBeTruthy();
      const completed = await call('/api/auth/mfa', 'POST', { challenge, code: codeAt(step + 1) }); expect(completed.status).toBe(200);
      expect((await call('/api/auth/forgot-password', 'POST', { email: 'owner@example.test' })).status).toBe(202); await deliverOutbox(db, config); const mail = [...sink].reverse().find(m => m.to === 'owner@example.test' && m.subject.includes('Reset'))!; const token = new URL(mail.text.match(/https:\/\/app\.test\/reset-password\?token=[a-f0-9]{64}/)![0]).searchParams.get('token');
      expect((await call('/api/auth/reset-password', 'POST', { token, password: 'New-Password-Phrase-42' })).status).toBe(400);
      const reset = await call('/api/auth/reset-password', 'POST', { token, password: 'New-Password-Phrase-42', code: recovery }); if (reset.status !== 200) expect(await data(reset)).toEqual({}); expect(reset.status).toBe(200);
      expect((await call('/api/auth/forgot-password', 'POST', { email: 'owner@example.test' })).status).toBe(202); await deliverOutbox(db, config); const mail2 = [...sink].reverse().find(m => m.to === 'owner@example.test' && m.subject.includes('Reset'))!; const token2 = new URL(mail2.text.match(/https:\/\/app\.test\/reset-password\?token=[a-f0-9]{64}/)![0]).searchParams.get('token');
      expect((await call('/api/auth/reset-password', 'POST', { token: token2, password: 'Another-Password-Phrase-42', code: recovery })).status).toBe(401);
      expect((await call('/api/workspace', 'GET', undefined, owner.session)).status).toBe(401);
      clock.mockReturnValue((step + 2) * 30000);
      const login = await call('/api/auth/login', 'POST', { email: 'owner@example.test', password: 'New-Password-Phrase-42' }); expect(login.status).toBe(200); const loginBody = await data(login); expect(loginBody.mfaRequired).toBe(true);
      const final = await call('/api/auth/mfa', 'POST', { challenge: loginBody.challenge, code: codeAt(step + 2) }); expect(final.status).toBe(200); owner.session = sessionFrom(final);
    } finally { clock.mockRestore(); }
  });
  it('keeps audit append-only and exports only authorised data', async () => {
    await expect(db.query('UPDATE audit_logs SET summary=$1', ['tampered'])).rejects.toThrow();
    const exported = await call('/api/export/workspace', 'GET', undefined, owner.session); expect(exported.status).toBe(200); const text = await exported.text(); expect(text).not.toContain('password_hash'); expect(text).not.toContain('token_hash'); expect(text).not.toContain('deviceToken');
    expect((await call('/api/export/workspace', 'GET', undefined, employee.session)).status).toBe(403);
    expect(hash('x')).toHaveLength(64);
  });
});

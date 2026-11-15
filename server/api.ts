/** Framework-independent HTTP boundary. Vercel and local tests call this same handler. */
import { ZodError, z } from 'zod';
import type { Database } from './db';
import { postgres } from './db';
import { configFromEnv, missingConfig, publicConfig, requestOrigin, type ServerConfig } from './config';
import { DomainError, applyCommand, type CommandResult } from '../src/platform/operations';
import { commandEnvelope, registerSchema, loginSchema, tokenSchema, acceptInviteSchema, resetRequestSchema, resetSchema, mfaVerifySchema, text } from '../src/platform/contracts';
import { authenticate, assertCsrf, contextFor, clearSessionCookies, allowedWorkspaces, register, login, completeMfa, verifyEmail, resendVerification, requestReset, resetPassword, invitationInfo, acceptInvitation, enableMfa, verifyMfaCode, type AuthUserRow } from './auth';
import { audit, loadDomain, persistDomain, afterDomainEffects, snapshot, publicUser } from './repository';
import { cookies, hash, verifyPassword, hashPassword, randomToken, newTotpSecret, encrypt, safeEqualHex } from './security';
import { deliverOutbox, initializeCheckout, settleCheckout, paystackWebhook, telemetrySchema, ingestTelemetry, issueDeviceToken, runScheduledWork } from './integrations';
import { invoiceBalanceKobo } from '../src/platform/money';
import { PLANS } from '../src/platform/plans';
import type { PlanId } from '../src/platform/types';

export interface ApiDeps { db?: Database; config?: ServerConfig; clientIp?: string }
const json = (value: unknown, status = 200, headers: string[] = []): Response => {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); headers.forEach(c => h.append('Set-Cookie', c));
  return new Response(JSON.stringify(value), { status, headers: h });
};
const fail = (message: string, code: string, status: number): never => { throw new DomainError(message, code, status); };
async function bodyText(request: Request): Promise<string> {
  const text = await request.text(); if (Buffer.byteLength(text) > 4_500_000) fail('Request is too large', 'PAYLOAD_TOO_LARGE', 413); return text;
}
async function parsed<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const raw = await bodyText(request); let value: unknown; try { value = JSON.parse(raw); } catch { return fail('Request body must be JSON', 'INVALID_JSON', 400); }
  const result = schema.safeParse(value); if (!result.success) throw new DomainError(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), 'VALIDATION_ERROR', 422); return result.data;
}
function assertOrigin(request: Request, config: ServerConfig): void {
  const origin = request.headers.get('origin');
  if (!origin || !config.allowedOrigins.includes(origin)) fail('Request origin is not allowed', 'ORIGIN_REJECTED', 403);
}
async function rateLimit(db: Database, key: string, limit: number, seconds: number): Promise<void> {
  const r = await db.query<{ count: number }>(`INSERT INTO rate_limits(key,window_start,count) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_start < now()-($2::text||' seconds')::interval THEN 1 ELSE rate_limits.count+1 END,
    window_start=CASE WHEN rate_limits.window_start < now()-($2::text||' seconds')::interval THEN now() ELSE rate_limits.window_start END RETURNING count`, [hash(key), seconds]);
  if (r.rows[0].count > limit) fail('Too many attempts. Please wait before trying again.', 'RATE_LIMITED', 429);
}
const sessionResult = (bundle: import('./auth').SessionBundle) => json({ user: bundle.user, tenantId: bundle.tenantId }, 200, bundle.headers);
const uuid = z.string().uuid();

export async function handleApi(request: Request, deps: ApiDeps = {}): Promise<Response> {
  const config = deps.config ?? configFromEnv(); const url = new URL(request.url); const path = url.pathname.replace(/\/$/, ''); const method = request.method.toUpperCase();
  const requestId = crypto.randomUUID();
  try {
    if (path === '/api/health') return json({ ok: true, service: 'techpros-one' });
    if (path === '/api/config') return json(publicConfig(config));
    const missing = missingConfig(config);
    if (config.mode === 'demo') {
      if (path.startsWith('/api/auth') || path === '/api/commands' || path === '/api/workspace') fail('This deployment is an explicitly fictional demo. Use the local demo sign-in, or configure live mode.', 'DEMO_MODE', 400);
      return json({ error: { code: 'DEMO_MODE', message: 'Live integrations are disabled in demo mode' } }, 404);
    }
    if (missing.length) return json({ error: { code: 'SETUP_REQUIRED', message: 'Server configuration is incomplete', required: missing } }, 503);
    const db = deps.db ?? postgres(config.databaseUrl!, { caCert: config.databaseCa, max: config.databasePoolMax });
    if (path === '/api/ready') {
      const r = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM schema_migrations');
      return json({ ok: Number(r.rows[0].count) > 0, database: 'reachable', migrations: Number(r.rows[0].count) });
    }
    const ip = deps.clientIp ?? 'unknown';
    await rateLimit(db, `general:${ip}`, 240, 60);
    // Signed/bearer machine endpoints do not use browser Origin or CSRF.
    if (path === '/api/webhooks/paystack' && method === 'POST') { await paystackWebhook(db, config, await bodyText(request), request.headers.get('x-paystack-signature')); return json({ ok: true }); }
    if (path === '/api/cron/run' && ['GET', 'POST'].includes(method)) {
      const supplied = request.headers.get('authorization') ?? ''; const expected = `Bearer ${config.cronSecret}`;
      if (supplied.length !== expected.length || !safeEqualHex(hash(supplied), hash(expected))) fail('Cron authentication failed', 'UNAUTHORIZED', 401);
      const work = await runScheduledWork(db, config); const mail = await deliverOutbox(db, config); return json({ ok: true, ...work, mail });
    }
    if (path === '/api/integrations/monitoring' && method === 'POST') {
      const input = await parsed(request, telemetrySchema); const tenantId = uuid.parse(request.headers.get('x-tenant-id')); const deviceId = uuid.parse(request.headers.get('x-device-id')); const eventId = text(100).parse(request.headers.get('x-event-id'));
      const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, ''); if (!/^[a-f0-9]{64}$/.test(token)) fail('Device token required', 'UNAUTHORIZED', 401);
      await rateLimit(db, `monitor:${tenantId}:${deviceId}`, 120, 60);
      return json(await ingestTelemetry(db, { tenantId, deviceId, token, eventId, metrics: input }));
    }
    if (!['GET', 'HEAD'].includes(method)) assertOrigin(request, config);
    if (path.startsWith('/api/auth/')) await rateLimit(db, `auth:${ip}:${path}`, path === '/api/auth/register' ? 5 : 10, path === '/api/auth/register' ? 3600 : 900);

    if (path === '/api/auth/register' && method === 'POST') {
      const input = await parsed(request, registerSchema); await db.transaction(tx => register(tx, config, input)); return json({ message: 'If this email can be registered, a verification link has been queued. Check your inbox.' }, 202);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const input = await parsed(request, loginSchema); await rateLimit(db, `login-email:${input.email}`, 10, 900);
      const result = await db.transaction(tx => login(tx, config, input.email, input.password));
      return 'mfaRequired' in result ? json(result) : sessionResult(result);
    }
    if (path === '/api/auth/mfa' && method === 'POST') { const input = await parsed(request, mfaVerifySchema); return sessionResult(await db.transaction(tx => completeMfa(tx, config, input.challenge, input.code))); }
    if (path === '/api/auth/verify-email' && method === 'POST') { const input = await parsed(request, tokenSchema); return sessionResult(await db.transaction(tx => verifyEmail(tx, config, input.token))); }
    if (path === '/api/auth/resend-verification' && method === 'POST') { const input = await parsed(request, resetRequestSchema); await db.transaction(tx => resendVerification(tx, config, input.email)); return json({ message: 'If verification is pending, a new link has been queued.' }, 202); }
    if (path === '/api/auth/forgot-password' && method === 'POST') { const input = await parsed(request, resetRequestSchema); await rateLimit(db, `reset-email:${input.email}`, 5, 900); await db.transaction(tx => requestReset(tx, config, input.email)); return json({ message: 'If the account exists, a reset link has been queued.' }, 202); }
    if (path === '/api/auth/reset-password' && method === 'POST') { const input = await parsed(request, resetSchema); await db.transaction(tx => resetPassword(tx, config, input.token, input.password, input.code)); return json({ message: 'Password changed. Sign in again.' }); }
    if (path === '/api/auth/invitation' && method === 'GET') return json(await db.transaction(tx => invitationInfo(tx, tokenSchema.shape.token.parse(url.searchParams.get('token')))));
    if (path === '/api/auth/accept-invitation' && method === 'POST') {
      const input = await parsed(request, acceptInviteSchema); const token = cookies(request.headers.get('cookie')).tp_session;
      const result = await db.transaction(async tx => { let userId: string | undefined; if (token && /^[a-f0-9]{64}$/.test(token)) { const r = await tx.query<{ user_id: string }>('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now() AND idle_expires_at>now()', [hash(token)]); userId = r.rows[0]?.user_id; } return acceptInvitation(tx, config, input.token, input.name, input.password, userId); });
      return sessionResult(result);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = cookies(request.headers.get('cookie')).tp_session;
      if (token && /^[a-f0-9]{64}$/.test(token)) await db.transaction(async tx => { const r = await tx.query<{ user_id: string }>('SELECT user_id FROM sessions WHERE token_hash=$1', [hash(token)]); await tx.query('DELETE FROM sessions WHERE token_hash=$1', [hash(token)]); if (r.rows[0]) await audit(tx, { actorId: r.rows[0].user_id, action: 'auth.signed_out', entity: 'session', entityId: hash(token).slice(0, 16), summary: 'Session revoked' }); });
      return json({ ok: true }, 200, clearSessionCookies(config));
    }

    // Every route below requires a live, verified, server-side session.
    const auth = await db.transaction(tx => authenticate(tx, request));
    if (!['GET', 'HEAD'].includes(method)) assertCsrf(request, auth.session);
    if (path === '/api/auth/session' && method === 'GET') return json({ user: publicUser(auth.user), tenantId: auth.session.active_tenant_id, workspaces: await db.transaction(tx => allowedWorkspaces(tx, auth.user.id)) });
    if (path === '/api/auth/switch' && method === 'POST') {
      const input = await parsed(request, z.object({ tenantId: uuid }).strict());
      await db.transaction(async tx => { await contextFor(tx, auth.user.id, input.tenantId); await tx.query('UPDATE sessions SET active_tenant_id=$2 WHERE token_hash=$1', [auth.session.token_hash, input.tenantId]); await audit(tx, { tenantId: input.tenantId, actorId: auth.user.id, actorName: auth.user.name, action: 'session.workspace_switched', entity: 'tenant', entityId: input.tenantId, summary: 'Active workspace switched' }); });
      return json({ tenantId: input.tenantId });
    }
    const requireTenant = () => auth.session.active_tenant_id ?? fail('Select a workspace first', 'WORKSPACE_REQUIRED', 400);
    if (path === '/api/workspace' && method === 'GET') {
      const tenantId = requireTenant(); return json(await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); return snapshot(tx, ctx); }));
    }
    if (path === '/api/commands' && method === 'POST') {
      const envelope = await parsed(request, commandEnvelope); const tenantId = requireTenant();
      const response = await db.transaction(async tx => {
        const ctx = await contextFor(tx, auth.user.id, tenantId); const loaded = await loadDomain(tx, tenantId, auth.user.id, { lock: true });
        if (loaded.revision !== envelope.revision) fail('This workspace changed in another session. Refresh and retry your action.', 'REVISION_CONFLICT', 409);
        const command = envelope.command; const before = structuredClone(loaded.data); const applied = applyCommand(loaded.data, ctx, command); const result: CommandResult & { deviceToken?: string } = applied.result;
        if (command.type === 'privacy.resolve' && command.status === 'completed') {
          const requestRow = before.privacyRequests.find(r => r.id === command.id);
          if (requestRow?.kind === 'erasure') {
            const other = await tx.query("SELECT 1 FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.tenant_id<>$2 AND m.status='active' AND t.data->>'status'='active'", [requestRow.userId, tenantId]);
            if (other.rows.length) fail('This account belongs to other active workspaces. Resolve those memberships before account erasure.', 'CONFLICT', 409);
            await tx.query('UPDATE users SET email=$2,password_hash=$3,mfa_enabled=false,mfa_secret=NULL,recovery_codes=$4 WHERE id=$1', [requestRow.userId, `erased-${requestRow.userId}@invalid.example`, await hashPassword(randomToken()), '[]']);
            await tx.query('DELETE FROM sessions WHERE user_id=$1', [requestRow.userId]); await tx.query('DELETE FROM auth_tokens WHERE user_id=$1', [requestRow.userId]);
          }
        }
        const revision = await persistDomain(tx, before, applied.data, tenantId); await afterDomainEffects(tx, before, applied.data, tenantId, config.appUrl);
        if (command.type === 'device.create' && result.id) result.deviceToken = await issueDeviceToken(tx, tenantId, result.id);
        const next = await snapshot(tx, ctx); return { result, snapshot: { ...next, revision } };
      });
      return json(response);
    }
    if (path === '/api/account/profile' && method === 'POST') {
      const input = await parsed(request, z.object({ name: text(120), phone: z.string().max(30), title: z.string().max(120) }).strict());
      await db.transaction(async tx => { await tx.query('UPDATE users SET name=$2,phone=$3,title=$4 WHERE id=$1', [auth.user.id, input.name, input.phone, input.title]); await audit(tx, { actorId: auth.user.id, actorName: input.name, action: 'account.profile_updated', entity: 'user', entityId: auth.user.id, summary: 'Account profile updated' }); }); return json({ ok: true });
    }
    if (path === '/api/account/password' && method === 'POST') {
      const input = await parsed(request, z.object({ currentPassword: z.string().max(128), password: z.string().min(12).max(128), code: z.string().max(20).optional() }).strict());
      if (!await verifyPassword(input.currentPassword, auth.user.password_hash)) fail('Current password is incorrect', 'INVALID_CREDENTIALS', 401);
      await db.transaction(async tx => { const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [auth.user.id]); if (r.rows[0].mfa_enabled) { const code = input.code; if (!code) throw new DomainError('Authenticator code required', 'MFA_REQUIRED', 400); await verifyMfaCode(tx, r.rows[0], code, config); } await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [auth.user.id, await hashPassword(input.password)]); await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [auth.user.id, auth.session.token_hash]); await audit(tx, { actorId: auth.user.id, actorName: auth.user.name, action: 'account.password_changed', entity: 'user', entityId: auth.user.id, summary: 'Password changed; other sessions revoked' }); }); return json({ ok: true });
    }
    if (path === '/api/account/mfa/setup' && method === 'POST') {
      const input = await parsed(request, z.object({ password: z.string().max(128) }).strict()); if (!await verifyPassword(input.password, auth.user.password_hash)) fail('Password is incorrect', 'INVALID_CREDENTIALS', 401);
      const secret = newTotpSecret(); await db.transaction(async tx => { await tx.query('UPDATE users SET mfa_secret=$2 WHERE id=$1 AND mfa_enabled=false', [auth.user.id, encrypt(secret, config.encryptionKey!)]); await audit(tx, { actorId: auth.user.id, action: 'account.mfa_setup_started', entity: 'user', entityId: auth.user.id, summary: 'Authenticator setup started' }); });
      return json({ secret, uri: `otpauth://totp/TechPros%20One:${encodeURIComponent(auth.user.email)}?secret=${secret}&issuer=TechPros%20One&algorithm=SHA1&digits=6&period=30` });
    }
    if (path === '/api/account/mfa/enable' && method === 'POST') {
      const input = await parsed(request, z.object({ code: z.string().regex(/^\d{6}$/) }).strict()); const codes = await db.transaction(async tx => { const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [auth.user.id]); return enableMfa(tx, config, r.rows[0], input.code); }); return json({ recoveryCodes: codes });
    }
    if (path === '/api/account/mfa/disable' && method === 'POST') {
      const input = await parsed(request, z.object({ code: z.string().min(6).max(20) }).strict()); await db.transaction(async tx => { const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [auth.user.id]); await verifyMfaCode(tx, r.rows[0], input.code, config); await tx.query("UPDATE users SET mfa_enabled=false,mfa_secret=NULL,recovery_codes='[]' WHERE id=$1", [auth.user.id]); await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [auth.user.id, auth.session.token_hash]); await audit(tx, { actorId: auth.user.id, action: 'account.mfa_disabled', entity: 'user', entityId: auth.user.id, summary: 'Authenticator disabled with a verified code' }); }); return json({ ok: true });
    }
    if (path === '/api/account/sessions' && method === 'GET') return json(await db.transaction(async tx => { const r = await tx.query<{ id: string; created_at: Date; expires_at: Date; current: boolean }>('SELECT left(token_hash,16) AS id,created_at,expires_at,token_hash=$2 AS current FROM sessions WHERE user_id=$1 ORDER BY created_at DESC', [auth.user.id, auth.session.token_hash]); return { sessions: r.rows }; }));
    if (path === '/api/account/sessions/revoke' && method === 'POST') {
      const input = await parsed(request, z.object({ id: z.string().regex(/^[a-f0-9]{16}$/).optional(), all: z.boolean().optional() }).strict());
      await db.transaction(async tx => { if (input.all) await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [auth.user.id, auth.session.token_hash]); else { if (!input.id) fail('Select a session', 'VALIDATION_ERROR', 422); await tx.query('DELETE FROM sessions WHERE user_id=$1 AND left(token_hash,16)=$2', [auth.user.id, input.id]); } await audit(tx, { actorId: auth.user.id, action: 'account.sessions_revoked', entity: 'user', entityId: auth.user.id, summary: 'Selected sessions revoked' }); }); return json({ ok: true });
    }
    if (path === '/api/billing/checkout' && method === 'POST') {
      const input = await parsed(request, z.object({ plan: z.enum(['starter', 'professional', 'business', 'msp_launch', 'msp_growth', 'msp_scale']) }).strict()); const tenantId = requireTenant(); const reference = `tp_${randomToken().slice(0, 28)}`;
      await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); if (ctx.delegated || ctx.role !== 'org_owner') fail('Only the workspace owner can change billing', 'FORBIDDEN', 403);
        const t = await tx.query<{ data: import('../src/platform/types').Tenant }>('SELECT data FROM tenants WHERE id=$1', [tenantId]); const plan = input.plan as PlanId;
        if ((t.rows[0].data.type === 'service_provider') !== plan.startsWith('msp_')) fail('Choose a plan for this workspace type', 'VALIDATION_ERROR', 422);
        const seats = await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM memberships WHERE tenant_id=$1 AND status='active'", [tenantId]); if (Number(seats.rows[0].count) > PLANS[plan].seats) fail('Reduce active seats before choosing this plan', 'SEAT_LIMIT', 409);
        await tx.query("INSERT INTO checkouts(reference,tenant_id,kind,entity_id,expected_amount,created_by,expires_at) VALUES($1,$2,'subscription',$3,$4,$5,now()+interval '30 minutes')", [reference, tenantId, plan, PLANS[plan].monthlyNgn * 100, auth.user.id]);
        await audit(tx, { tenantId, actorId: auth.user.id, actorName: auth.user.name, action: 'billing.checkout_created', entity: 'checkout', entityId: reference, summary: `Prepaid monthly checkout started for ${plan}` }); });
      return json({ url: await initializeCheckout(db, config, reference, requestOrigin(request, config)), reference });
    }
    if (path === '/api/invoices/checkout' && method === 'POST') {
      const input = await parsed(request, z.object({ id: uuid }).strict()); const tenantId = requireTenant(); const reference = `tp_inv_${randomToken().slice(0, 24)}`;
      await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); if (!ctx.delegated && ctx.role !== 'org_owner' && !['org_admin', 'finance_officer', 'svc_delivery_manager', 'account_manager'].includes(ctx.role)) fail('Invoice permission required', 'FORBIDDEN', 403);
        const r = await tx.query<{ data: import('../src/platform/types').Invoice }>("SELECT data FROM records WHERE tenant_id=$1 AND id=$2 AND kind='invoices' FOR UPDATE", [tenantId, input.id]); const i = r.rows[0]?.data; if (!i || !['sent', 'partial', 'overdue'].includes(i.status)) fail('Invoice is not payable', 'NOT_FOUND', 404);
        const amount = invoiceBalanceKobo(i); if (amount <= 0) fail('Invoice has no outstanding balance', 'CONFLICT', 409);
        await tx.query("INSERT INTO checkouts(reference,tenant_id,kind,entity_id,expected_amount,created_by,expires_at) VALUES($1,$2,'invoice',$3,$4,$5,now()+interval '30 minutes')", [reference, tenantId, i.id, amount, auth.user.id]);
        await audit(tx, { tenantId, actorId: auth.user.id, action: 'invoice.checkout_created', entity: 'invoice', entityId: i.id, summary: `Verified checkout started for ${i.number}` }); });
      return json({ url: await initializeCheckout(db, config, reference, requestOrigin(request, config)), reference });
    }
    if (path === '/api/billing/verify' && method === 'GET') {
      const reference = z.string().max(80).parse(url.searchParams.get('reference')); const tenantId = requireTenant();
      const owned = await db.query('SELECT 1 FROM checkouts WHERE reference=$1 AND tenant_id=$2', [reference, tenantId]); if (!owned.rows.length) fail('Checkout not found', 'NOT_FOUND', 404);
      return json(await settleCheckout(db, config, reference));
    }
    if (path === '/api/attachments' && method === 'POST') {
      const input = await parsed(request, z.object({ entityId: uuid, name: text(180), mime: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']), contentBase64: z.string().max(4_100_000) }).strict());
      const bytes = Buffer.from(input.contentBase64, 'base64'); if (bytes.length > 3 * 1024 * 1024 || bytes.length === 0) fail('Attachments must be between 1 byte and 3 MB', 'VALIDATION_ERROR', 422);
      const magic = input.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : input.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : input.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : !bytes.includes(0);
      if (!magic) fail('File content does not match its type', 'VALIDATION_ERROR', 422);
      const tenantId = requireTenant(); const attachmentId = crypto.randomUUID();
      await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); const s = await snapshot(tx, ctx); if (![...s.data.tickets, ...s.data.assets, ...s.data.documents].some(x => x.id === input.entityId)) fail('Entity not found or outside your scope', 'NOT_FOUND', 404);
        const count = await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM records WHERE tenant_id=$1 AND kind='attachments' AND data->>'entityId'=$2::text", [tenantId, input.entityId]); if (Number(count.rows[0].count) >= 10) fail('Attachment limit reached for this record', 'LIMIT_REACHED', 409);
        const meta = { id: attachmentId, tenantId, entityId: input.entityId, name: input.name.replace(/[/\\\r\n]/g, '_'), mime: input.mime, size: bytes.length, createdBy: auth.user.id, createdAt: new Date().toISOString() };
        await tx.query("INSERT INTO records(tenant_id,id,kind,data) VALUES($1,$2,'attachments',$3::jsonb)", [tenantId, attachmentId, JSON.stringify(meta)]); await tx.query('INSERT INTO attachment_blobs(tenant_id,id,content) VALUES($1,$2,$3)', [tenantId, attachmentId, bytes]);
        await audit(tx, { tenantId, actorId: auth.user.id, actorName: auth.user.name, action: 'attachment.uploaded', entity: 'attachment', entityId: attachmentId, summary: `Validated attachment added to ${input.entityId}` }); await tx.query('UPDATE tenants SET revision=revision+1 WHERE id=$1', [tenantId]); });
      return json({ id: attachmentId }, 201);
    }
    if (path.startsWith('/api/attachments/') && method === 'GET') {
      const attachmentId = uuid.parse(path.split('/').pop()); const tenantId = requireTenant();
      const result = await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); const s = await snapshot(tx, ctx); const meta = s.data.attachments.find(a => a.id === attachmentId); if (!meta) throw new DomainError('Attachment not found or outside your scope', 'NOT_FOUND', 404); const r = await tx.query<{ content: Buffer }>('SELECT content FROM attachment_blobs WHERE tenant_id=$1 AND id=$2', [tenantId, attachmentId]); await audit(tx, { tenantId, actorId: auth.user.id, action: 'attachment.downloaded', entity: 'attachment', entityId: attachmentId, summary: 'Authorised attachment download' }); return { meta, bytes: r.rows[0].content }; });
      return new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': result.meta.mime, 'Content-Disposition': `attachment; filename="${result.meta.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path === '/api/export/workspace' && method === 'GET') {
      const tenantId = requireTenant(); const result = await db.transaction(async tx => { const ctx = await contextFor(tx, auth.user.id, tenantId); if (ctx.delegated || !['org_owner', 'org_admin'].includes(ctx.role)) fail('Workspace export requires an owner or administrator', 'FORBIDDEN', 403); const s = await snapshot(tx, ctx); await audit(tx, { tenantId, actorId: auth.user.id, actorName: auth.user.name, action: 'privacy.workspace_exported', entity: 'tenant', entityId: tenantId, summary: 'Authorised workspace export downloaded' }); return s; });
      return new Response(JSON.stringify(result, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="techpros-workspace-${tenantId}.json"`, 'Cache-Control': 'private, no-store' } });
    }
    if (path === '/api/account/export' && method === 'GET') {
      const result = await db.transaction(async tx => { const spaces = await allowedWorkspaces(tx, auth.user.id); await audit(tx, { actorId: auth.user.id, actorName: auth.user.name, action: 'privacy.personal_exported', entity: 'user', entityId: auth.user.id, summary: 'Personal account data exported' }); return { user: publicUser(auth.user), workspaces: spaces, exportedAt: new Date().toISOString() }; }); return json(result);
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404);
  } catch (error) {
    if (error instanceof DomainError) return json({ error: { code: error.code, message: error.message }, requestId }, error.status);
    if (error instanceof ZodError) return json({ error: { code: 'VALIDATION_ERROR', message: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, requestId }, 422);
    const code = (error as { code?: string }).code;
    if (code === '23505') return json({ error: { code: 'CONFLICT', message: 'A record with these details already exists. Refresh and try again.' }, requestId }, 409);
    if (code === '23503') return json({ error: { code: 'VALIDATION_ERROR', message: 'A referenced record is missing or belongs to another workspace.' }, requestId }, 422);
    console.error(JSON.stringify({ requestId, event: 'api_error', code: code ?? 'INTERNAL_ERROR', name: error instanceof Error ? error.name : 'UnknownError' }));
    return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed safely. No partial changes were committed. Retry or contact support with the request ID.' }, requestId }, 500);
  }
}

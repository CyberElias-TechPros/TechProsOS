import type { Database } from './db';
import type { ServerConfig } from './config';
import { DomainError } from '../src/platform/operations';
import { emptyData, provisionWorkspace } from '../src/platform/operations';
import { accessContextFor, type AccessContext } from '../src/platform/permissions';
import type { RoleId } from '../src/platform/types';
import type { z } from 'zod';
import type { registerSchema } from '../src/platform/contracts';
import { cookie, cookies, csrfCookie, decrypt, hash, newRecoveryCodes, randomToken, safeEqualHex, verifyPassword, hashPassword, verifyTotp } from './security';
import { audit, enqueueEmail, publicUser, membership, tenantRow } from './repository';
import type { Tenant, User } from '../src/platform/types';

export type AuthUserRow = { id: string; email: string; name: string; phone: string; title: string; status: 'active' | 'deactivated'; email_verified_at: Date | null; mfa_enabled: boolean; created_at: Date; password_hash: string; mfa_secret: string | null; mfa_last_step: string | number; recovery_codes: string[] };
export type SessionRow = { token_hash: string; user_id: string; csrf_hash: string; active_tenant_id: string | null; expires_at: Date; idle_expires_at: Date };
const error = (message: string, code: string, status: number): never => { throw new DomainError(message, code, status); };
const DUMMY_HASH = `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export interface SessionBundle { headers: string[]; user: User; tenantId: string | null; csrfToken: string }
export async function allowedWorkspaces(tx: Database, userId: string): Promise<{ id: string; name: string; type: Tenant['type']; role: RoleId; delegated: boolean }[]> {
  const result = await tx.query<{ id: string; data: Tenant; role: RoleId; delegated: boolean }>(`
    SELECT t.id,t.data,m.role,false AS delegated FROM tenants t JOIN memberships m ON m.tenant_id=t.id
      WHERE m.user_id=$1 AND m.status='active' AND t.data->>'status'='active'
    UNION ALL
    SELECT t.id,t.data,pm.role,true AS delegated FROM records r JOIN tenants t ON t.id=r.tenant_id
      JOIN memberships pm ON pm.tenant_id=(r.data->>'providerId')::uuid AND pm.user_id=$1 AND pm.status='active'
      WHERE r.kind='delegations' AND r.data->>'userId'=$1::text AND r.data->>'status'='active'
      AND (r.data->>'expiresAt')::timestamptz > now() AND t.data->>'status'='active'
`, [userId]);
  return result.rows.sort((a,b) => a.data.name.localeCompare(b.data.name)).map(r => ({ id: r.id, name: r.data.name, type: r.data.type, role: r.role, delegated: r.delegated }));
}
export async function createSession(tx: Database, config: ServerConfig, userId: string, requestedTenant?: string): Promise<SessionBundle> {
  const user = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1', [userId]);
  if (!user.rows[0] || user.rows[0].status !== 'active' || !user.rows[0].email_verified_at) error('Verify your email before signing in', 'EMAIL_UNVERIFIED', 403);
  const spaces = await allowedWorkspaces(tx, userId);
  const tenantId = requestedTenant ?? spaces[0]?.id ?? null;
  if (requestedTenant && !spaces.some(s => s.id === requestedTenant)) error('Workspace access denied', 'FORBIDDEN', 403);
  const token = randomToken(), csrf = randomToken(); const absolute = 12 * 3600;
  await tx.query("INSERT INTO sessions(token_hash,user_id,csrf_hash,active_tenant_id,expires_at,idle_expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours',now()+interval '30 minutes')", [hash(token), userId, hash(csrf), tenantId]);
  await audit(tx, { tenantId: tenantId ?? undefined, actorId: userId, actorName: user.rows[0].name, action: 'auth.signed_in', entity: 'session', entityId: hash(token).slice(0, 16), summary: 'Verified session created' });
  return { headers: [cookie('tp_session', token, config.secureCookies, absolute), csrfCookie(csrf, config.secureCookies)], user: publicUser(user.rows[0]), tenantId, csrfToken: csrf };
}
export function clearSessionCookies(config: ServerConfig): string[] { return [cookie('tp_session', '', config.secureCookies, 0), `tp_csrf=; Path=/; SameSite=Lax; Max-Age=0${config.secureCookies ? '; Secure' : ''}`]; }
export async function authenticate(tx: Database, request: Request): Promise<{ user: AuthUserRow; session: SessionRow; token: string }> {
  const token = cookies(request.headers.get('cookie')).tp_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return error('Sign in to continue', 'UNAUTHORIZED', 401);
  const rows = await tx.query<SessionRow & { user: AuthUserRow }>(`SELECT s.*, to_jsonb(u) AS user FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.idle_expires_at>now()`, [hash(token)]);
  const row = rows.rows[0]; if (!row || row.user.status !== 'active') return error('Session expired; sign in again', 'UNAUTHORIZED', 401);
  await tx.query("UPDATE sessions SET idle_expires_at=LEAST(expires_at,now()+interval '30 minutes') WHERE token_hash=$1", [hash(token)]);
  return { user: row.user, session: row, token };
}
export function assertCsrf(request: Request, session: SessionRow): void {
  const csrf = request.headers.get('x-csrf-token') ?? '';
  if (!safeEqualHex(hash(csrf), session.csrf_hash)) error('Security token mismatch. Refresh and try again.', 'CSRF_REJECTED', 403);
}
export async function contextFor(tx: Database, userId: string, tenantId: string): Promise<AccessContext> {
  const t = await tenantRow(tx, tenantId);
  const ms = await tx.query<Parameters<typeof membership>[0]>('SELECT * FROM memberships WHERE user_id=$1 AND (tenant_id=$2 OR tenant_id=$3)', [userId, tenantId, t.data.providerId ?? null]);
  const grants = await tx.query<{ data: import('../src/platform/types').Delegation }>("SELECT data FROM records WHERE kind='delegations' AND tenant_id=$1 AND data->>'userId'=$2::text AND data->>'status'='active'", [tenantId, userId]);
  const ctx = accessContextFor(ms.rows.map(membership), userId, tenantId, t.data.providerId, grants.rows.map(r => r.data));
  if (!ctx || t.data.status !== 'active') return error('Workspace access denied or expired', 'FORBIDDEN', 403);
  return ctx;
}
async function issueToken(tx: Database, userId: string, kind: 'verify_email' | 'reset_password' | 'mfa', minutes: number, payload: Record<string, string> = {}): Promise<string> {
  const token = randomToken(); await tx.query('DELETE FROM auth_tokens WHERE user_id=$1 AND kind=$2', [userId, kind]);
  await tx.query("INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,payload) VALUES($1,$2,$3,now()+($4::text||' minutes')::interval,$5::jsonb)", [hash(token), userId, kind, minutes, JSON.stringify(payload)]); return token;
}
async function consumeToken(tx: Database, token: string, kind: 'verify_email' | 'reset_password' | 'mfa') {
  const r = await tx.query<{ user_id: string; payload: Record<string, string> }>('SELECT user_id,payload FROM auth_tokens WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [hash(token), kind]);
  if (!r.rows[0]) return error('This link or challenge is invalid or expired', 'INVALID_TOKEN', 400);
  await tx.query('UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1', [hash(token)]); return r.rows[0];
}
export async function register(tx: Database, config: ServerConfig, input: z.infer<typeof registerSchema>): Promise<void> {
  if (!config.emailKey || !config.emailFrom) if (!config.testEmailSink) error('Email delivery is not configured. Contact the operator.', 'EMAIL_NOT_CONFIGURED', 503);
  if ((input.type === 'service_provider') !== input.plan.startsWith('msp_')) error('Choose a plan that matches the workspace type', 'VALIDATION_ERROR', 422);
  const passwordHash = await hashPassword(input.password);
  const existing = await tx.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [input.ownerEmail]);
  if (existing.rows[0]) {
    await enqueueEmail(tx, { dedupe: `existing:${existing.rows[0].id}:${Math.floor(Date.now() / 3600000)}`, to: input.ownerEmail, subject: 'TechPros One account notice', text: `A registration was attempted with this email. If this was you, sign in or reset your password at ${config.appUrl}/login. No new workspace was created.` }); return;
  }
  const userId = crypto.randomUUID(), tenantId = crypto.randomUUID(); const ids = { tenantId, userId, branchIds: input.branches.map(() => crypto.randomUUID()), departmentIds: input.departments.map(() => crypto.randomUUID()), policyId: crypto.randomUUID() };
  const d = emptyData(); const now = new Date().toISOString();
  d.users.push({ id: userId, name: input.ownerName, email: input.ownerEmail, phone: input.ownerPhone, title: 'Organisation Owner', status: 'active', createdAt: now });
  provisionWorkspace(d, input, ids, now);
  await tx.query('INSERT INTO users(id,email,name,phone,title,password_hash,privacy_consent_at) VALUES($1,$2,$3,$4,$5,$6,now())', [userId, input.ownerEmail, input.ownerName, input.ownerPhone, 'Organisation Owner', passwordHash]);
  await tx.query('INSERT INTO tenants(id,data) VALUES($1,$2::jsonb)', [tenantId, JSON.stringify(d.tenants[0])]);
  for (const kind of ['branches', 'departments', 'slaPolicies'] as const) for (const row of d[kind]) await tx.query('INSERT INTO records(tenant_id,id,kind,data) VALUES($1,$2,$3,$4::jsonb)', [tenantId, row.id, kind, JSON.stringify(row)]);
  await tx.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'org_owner')", [tenantId, userId]);
  const a = d.auditLogs[0]; await audit(tx, { tenantId, actorId: userId, actorName: input.ownerName, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary });
  const token = await issueToken(tx, userId, 'verify_email', 60, { tenantId });
  await enqueueEmail(tx, { tenantId, dedupe: `verify:${userId}`, to: input.ownerEmail, subject: 'Verify your TechPros One email', text: `Welcome to TechPros One.\n\nVerify your email within one hour to activate your workspace:\n${config.appUrl}/verify-email?token=${token}\n\nYour 14-day trial starts now. No payment card is required.` });
}
export async function login(tx: Database, config: ServerConfig, email: string, password: string): Promise<SessionBundle | { mfaRequired: true; challenge: string }> {
  const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE email=$1', [email]); const user = r.rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid || user.status !== 'active') return error('Email or password is incorrect', 'INVALID_CREDENTIALS', 401);
  if (!user.email_verified_at) return error('Verify your email first. Check your inbox or request a new verification link.', 'EMAIL_UNVERIFIED', 403);
  if (user.mfa_enabled) { const challenge = await issueToken(tx, user.id, 'mfa', 5); await audit(tx, { actorId: user.id, actorName: user.name, action: 'auth.mfa_challenged', entity: 'user', entityId: user.id, summary: 'Password verified; authenticator required' }); return { mfaRequired: true, challenge }; }
  return createSession(tx, config, user.id);
}
export async function verifyMfaCode(tx: Database, user: AuthUserRow, code: string, config: ServerConfig): Promise<void> {
  if (!user.mfa_enabled || !user.mfa_secret || !config.encryptionKey) return error('Authenticator is not enabled', 'MFA_REQUIRED', 400);
  const normalized = code.trim().toLowerCase().replace(/-/g, '');
  const recovery = user.recovery_codes.findIndex(h => h === hash(normalized));
  if (recovery >= 0) { const codes = [...user.recovery_codes]; codes.splice(recovery, 1); await tx.query('UPDATE users SET recovery_codes=$2::jsonb WHERE id=$1', [user.id, JSON.stringify(codes)]); return; }
  const step = verifyTotp(decrypt(user.mfa_secret, config.encryptionKey), code.replace(/\s/g, ''), Date.now(), Number(user.mfa_last_step));
  if (step === null) return error('Invalid or already-used authenticator code', 'INVALID_MFA', 401);
  await tx.query('UPDATE users SET mfa_last_step=$2 WHERE id=$1', [user.id, step]);
}
export async function completeMfa(tx: Database, config: ServerConfig, challenge: string, code: string): Promise<SessionBundle> {
  const token = await consumeToken(tx, challenge, 'mfa'); const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [token.user_id]);
  await verifyMfaCode(tx, r.rows[0], code, config); return createSession(tx, config, token.user_id);
}
export async function verifyEmail(tx: Database, config: ServerConfig, token: string): Promise<SessionBundle> {
  const consumed = await consumeToken(tx, token, 'verify_email'); await tx.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [consumed.user_id]);
  await audit(tx, { tenantId: consumed.payload.tenantId, actorId: consumed.user_id, action: 'auth.email_verified', entity: 'user', entityId: consumed.user_id, summary: 'Email ownership verified' });
  return createSession(tx, config, consumed.user_id, consumed.payload.tenantId);
}
export async function resendVerification(tx: Database, config: ServerConfig, email: string): Promise<void> {
  const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE email=$1', [email]); const u = r.rows[0]; if (!u || u.email_verified_at) return;
  const m = await tx.query<{ tenant_id: string }>("SELECT tenant_id FROM memberships WHERE user_id=$1 AND status='active' LIMIT 1", [u.id]); const token = await issueToken(tx, u.id, 'verify_email', 60, { tenantId: m.rows[0]?.tenant_id ?? '' });
  await enqueueEmail(tx, { dedupe: `verify:${u.id}:${Date.now()}`, to: u.email, subject: 'Verify your TechPros One email', text: `Verify your email within one hour:\n${config.appUrl}/verify-email?token=${token}` });
}
export async function requestReset(tx: Database, config: ServerConfig, email: string): Promise<void> {
  const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE email=$1', [email]); const u = r.rows[0]; if (!u || u.status !== 'active') return;
  const token = await issueToken(tx, u.id, 'reset_password', 30);
  await enqueueEmail(tx, { dedupe: `reset:${u.id}:${hash(token)}`, to: u.email, subject: 'Reset your TechPros One password', text: `A password reset was requested. This single-use link expires in 30 minutes:\n${config.appUrl}/reset-password?token=${token}\n\nIf this was not you, ignore this email. Your password has not changed.` });
}
export async function resetPassword(tx: Database, config: ServerConfig, token: string, password: string, code?: string): Promise<void> {
  const consumed = await consumeToken(tx, token, 'reset_password'); const r = await tx.query<AuthUserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [consumed.user_id]); const u = r.rows[0];
  if (u.mfa_enabled) { if (!code) return error('Enter your authenticator or recovery code', 'MFA_REQUIRED', 400); await verifyMfaCode(tx, u, code, config); }
  await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, await hashPassword(password)]); await tx.query('DELETE FROM sessions WHERE user_id=$1', [u.id]); await tx.query('DELETE FROM auth_tokens WHERE user_id=$1', [u.id]);
  await audit(tx, { actorId: u.id, actorName: u.name, action: 'auth.password_reset', entity: 'user', entityId: u.id, summary: 'Password reset; all sessions revoked' });
}
export async function invitationInfo(tx: Database, token: string) {
  const r = await tx.query<{ name: string; email: string; role: RoleId; tenant_name: string }>("SELECT i.name,i.email,i.role,t.data->>'name' AS tenant_name FROM invitations i JOIN tenants t ON t.id=i.tenant_id WHERE i.token_hash=$1 AND i.status='pending' AND i.expires_at>now()", [hash(token)]);
  if (!r.rows[0]) return error('Invitation is invalid, expired or already used', 'INVALID_TOKEN', 400); return r.rows[0];
}
export async function acceptInvitation(tx: Database, config: ServerConfig, token: string, name: string, password?: string, signedInUserId?: string): Promise<SessionBundle> {
  const r = await tx.query<{ id: string; tenant_id: string; email: string; role: RoleId }>("SELECT * FROM invitations WHERE token_hash=$1 AND status='pending' AND expires_at>now() FOR UPDATE", [hash(token)]); const invite = r.rows[0];
  if (!invite) return error('Invitation is invalid, expired or already used', 'INVALID_TOKEN', 400);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [invite.email]);
  const existing = await tx.query<AuthUserRow>('SELECT * FROM users WHERE email=$1', [invite.email]); let userId: string;
  if (existing.rows[0]) {
    const u = existing.rows[0]; userId = u.id;
    if (signedInUserId && signedInUserId !== userId) return error('Sign out of the current account before accepting an invitation for another email', 'ACCOUNT_MISMATCH', 401);
    if (signedInUserId !== userId && (!password || !await verifyPassword(password, u.password_hash))) return error('Sign in with the invited email and confirm your password', 'INVALID_CREDENTIALS', 401);
    if (u.status !== 'active') return error('This account is deactivated', 'FORBIDDEN', 403);
    await tx.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1', [userId]);
  } else {
    if (signedInUserId) return error('Sign out of the current account before accepting an invitation for another email', 'ACCOUNT_MISMATCH', 401);
    if (!password) return error('Choose a password of at least 12 characters', 'PASSWORD_REQUIRED', 422);
    userId = crypto.randomUUID(); await tx.query('INSERT INTO users(id,email,name,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())', [userId, invite.email, name, await hashPassword(password)]);
  }
  const m = await tx.query("SELECT status FROM memberships WHERE tenant_id=$1 AND user_id=$2", [invite.tenant_id, userId]);
  if (m.rows[0]?.status === 'active') return error('You already belong to this workspace', 'CONFLICT', 409);
  await tx.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role,status='active'", [invite.tenant_id, userId, invite.role]);
  await tx.query("UPDATE invitations SET status='accepted',accepted_by=$2 WHERE id=$1", [invite.id, userId]);
  await audit(tx, { tenantId: invite.tenant_id, actorId: userId, actorName: name, action: 'user.invitation_accepted', entity: 'invitation', entityId: invite.id, summary: 'Invited recipient verified email ownership and joined' });
  return createSession(tx, config, userId, invite.tenant_id);
}
export async function enableMfa(tx: Database, config: ServerConfig, user: AuthUserRow, code: string): Promise<string[]> {
  if (user.mfa_enabled) return error('Authenticator already enabled', 'CONFLICT', 409);
  if (!user.mfa_secret || !config.encryptionKey) return error('Start authenticator setup first', 'MFA_SETUP_REQUIRED', 400);
  const step = verifyTotp(decrypt(user.mfa_secret, config.encryptionKey), code, Date.now(), -1); if (step === null) return error('Invalid authenticator code', 'INVALID_MFA', 400);
  const codes = newRecoveryCodes(); await tx.query('UPDATE users SET mfa_enabled=true,mfa_last_step=$2,recovery_codes=$3::jsonb WHERE id=$1', [user.id, step, JSON.stringify(codes.map(code => hash(code.replace(/-/g, ''))))]);
  await audit(tx, { actorId: user.id, actorName: user.name, action: 'auth.mfa_enabled', entity: 'user', entityId: user.id, summary: 'Authenticator enabled; recovery codes issued once' }); return codes;
}

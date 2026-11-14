import type { Database } from './db';
import { RECORD_KINDS, type RecordKind } from './schema';
import type { DataSet, Tenant, User, Membership, Invitation, AuditLog, ID } from '../src/platform/types';
import { emptyData } from '../src/platform/operations';
import { projectWorkspace } from '../src/platform/reporting';
import type { AccessContext } from '../src/platform/permissions';
import { randomToken, hash } from './security';
import { DomainError } from '../src/platform/operations';

type TenantRow = { id: string; data: Tenant; revision: string | number };
type RecordRow = { tenant_id: string; id: string; kind: RecordKind; data: { id: string; tenantId: string } };
type UserRow = { id: string; email: string; name: string; phone: string; title: string; status: 'active' | 'deactivated'; email_verified_at: Date | null; mfa_enabled: boolean; created_at: Date };
type MembershipRow = { tenant_id: string; user_id: string; role: Membership['role']; status: Membership['status']; branch_id: string | null; department_id: string | null };
type InvitationRow = { id: string; tenant_id: string; email: string; name: string; role: Membership['role']; status: Invitation['status']; expires_at: Date; created_at: Date };
const iso = (value: Date | string) => new Date(value).toISOString();
export const publicUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, phone: r.phone, title: r.title, status: r.status, createdAt: iso(r.created_at), emailVerified: !!r.email_verified_at, mfaEnabled: r.mfa_enabled });
export const membership = (r: MembershipRow): Membership => ({ tenantId: r.tenant_id, userId: r.user_id, role: r.role, status: r.status, branchId: r.branch_id ?? undefined, departmentId: r.department_id ?? undefined });
const invitation = (r: InvitationRow): Invitation => ({ id: r.id, tenantId: r.tenant_id, email: r.email, name: r.name, role: r.role, status: r.status, expiresAt: iso(r.expires_at), createdAt: iso(r.created_at) });

export async function tenantRow(tx: Database, id: string, lock = false): Promise<TenantRow> {
  const r = await tx.query<TenantRow>('SELECT id,data,revision FROM tenants WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id]);
  if (!r.rows[0]) throw new DomainError('Workspace not found', 'NOT_FOUND', 404); return r.rows[0];
}
export async function loadDomain(tx: Database, tenantId: string, userId: string, options: { lock?: boolean; audit?: boolean } = {}): Promise<{ data: DataSet; revision: number }> {
  const row = await tenantRow(tx, tenantId, options.lock); const data = emptyData(); data.tenants.push(row.data);
  const related = await tx.query<TenantRow>("SELECT id,data,revision FROM tenants WHERE id IN (SELECT tenant_id FROM memberships WHERE user_id=$1 AND status='active') OR data->>'providerId'=$2::text", [userId, tenantId]);
  for (const t of related.rows) if (!data.tenants.some(x => x.id === t.id)) data.tenants.push(t.data);
  const records = await tx.query<RecordRow>('SELECT tenant_id,id,kind,data FROM records WHERE tenant_id=$1', [tenantId]);
  // Provider-side grant editing needs the grant envelope, never the client's operational records.
  const grants = await tx.query<RecordRow>("SELECT tenant_id,id,kind,data FROM records WHERE kind='delegations' AND data->>'providerId'=$1::text AND tenant_id <> $1::uuid", [tenantId]);
  for (const r of [...records.rows, ...grants.rows]) (data[r.kind] as unknown as { id: string; tenantId: string }[]).push(r.data);
  const ms = await tx.query<MembershipRow>('SELECT * FROM memberships WHERE tenant_id=$1', [tenantId]); data.memberships = ms.rows.map(membership);
  const userIds = new Set([userId, ...ms.rows.map(m => m.user_id), ...data.delegations.map(g => g.userId)]);
  const users = await tx.query<UserRow>('SELECT * FROM users WHERE id = ANY($1::uuid[])', [[...userIds]]); data.users = users.rows.map(publicUser);
  const invitations = await tx.query<InvitationRow>('SELECT * FROM invitations WHERE tenant_id=$1', [tenantId]); data.invitations = invitations.rows.map(invitation);
  const counters = await tx.query<{ kind: string; value: string }>('SELECT kind,value FROM counters WHERE tenant_id=$1', [tenantId]);
  data.counters = Object.fromEntries(counters.rows.map(c => [`${tenantId}:${c.kind}`, Number(c.value)]));
  if (options.audit) {
    const logs = await tx.query<{ id: string; tenant_id: string; actor_id: string; actor_name: string; action: string; entity: string; entity_id: string; summary: string; diff: AuditLog['diff']; at: Date }>('SELECT * FROM audit_logs WHERE tenant_id=$1 ORDER BY at DESC LIMIT 1000', [tenantId]);
    data.auditLogs = logs.rows.map(a => ({ id: a.id, tenantId: a.tenant_id, actorId: a.actor_id, actorName: a.actor_name, action: a.action, entity: a.entity, entityId: a.entity_id, summary: a.summary, diff: a.diff, at: iso(a.at) }));
  }
  return { data, revision: Number(row.revision) };
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export async function persistDomain(tx: Database, before: DataSet, after: DataSet, tenantId: string): Promise<number> {
  const beforeTenants = new Map(before.tenants.map(t => [t.id, t]));
  for (const t of after.tenants) {
    const old = beforeTenants.get(t.id);
    if (!old) {
      if (t.providerId !== tenantId || t.type !== 'organisation') throw new DomainError('Cannot create an unrelated tenant', 'FORBIDDEN', 403);
      await tx.query('INSERT INTO tenants(id,data) VALUES($1,$2::jsonb)', [t.id, JSON.stringify(t)]);
    } else if (!same(old, t)) {
      if (t.id !== tenantId) throw new DomainError('Cannot edit another workspace profile', 'FORBIDDEN', 403);
      await tx.query('UPDATE tenants SET data=$2::jsonb,updated_at=now() WHERE id=$1', [t.id, JSON.stringify(t)]);
    }
  }
  const allowedTenants = new Set(after.tenants.filter(t => t.id === tenantId || t.providerId === tenantId).map(t => t.id));
  for (const kind of RECORD_KINDS) {
    const oldRows = before[kind] as unknown as { id: string; tenantId: string }[];
    const newRows = after[kind] as unknown as { id: string; tenantId: string }[];
    const old = new Map(oldRows.map(r => [`${r.tenantId}:${r.id}`, r]));
    for (const r of newRows) {
      if (!allowedTenants.has(r.tenantId)) throw new DomainError('Cross-tenant record write rejected', 'FORBIDDEN', 403);
      if (r.tenantId !== tenantId && kind !== 'delegations' && !before.tenants.some(t => t.id === r.tenantId) && !['branches', 'slaPolicies'].includes(kind)) throw new DomainError('Unexpected client record write', 'FORBIDDEN', 403);
      const previous = old.get(`${r.tenantId}:${r.id}`);
      if (!previous) await tx.query('INSERT INTO records(tenant_id,id,kind,data) VALUES($1,$2,$3,$4::jsonb)', [r.tenantId, r.id, kind, JSON.stringify(r)]);
      else if (!same(previous, r)) await tx.query('UPDATE records SET data=$2::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$3', [r.tenantId, JSON.stringify(r), r.id]);
    }
    const current = new Set(newRows.map(r => `${r.tenantId}:${r.id}`));
    if (oldRows.some(r => !current.has(`${r.tenantId}:${r.id}`))) throw new DomainError('Business records are retained; use an approved privacy/retention process', 'CONFLICT', 409);
  }
  for (const m of after.memberships) {
    const old = before.memberships.find(x => x.tenantId === m.tenantId && x.userId === m.userId);
    if (!same(old, m)) await tx.query('INSERT INTO memberships(tenant_id,user_id,role,status,branch_id,department_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,branch_id=EXCLUDED.branch_id,department_id=EXCLUDED.department_id', [m.tenantId, m.userId, m.role, m.status, m.branchId ?? null, m.departmentId ?? null]);
  }
  for (const i of after.invitations) {
    const old = before.invitations.find(x => x.id === i.id);
    if (!same(old, i)) await tx.query('INSERT INTO invitations(id,tenant_id,email,name,role,status,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status', [i.id, i.tenantId, i.email, i.name, i.role, i.status, i.expiresAt, i.createdAt]);
  }
  for (const u of after.users) {
    const old = before.users.find(x => x.id === u.id);
    if (old && !same(old, u)) await tx.query('UPDATE users SET name=$2,phone=$3,status=$4 WHERE id=$1', [u.id, u.name, u.phone, u.status]);
  }
  for (const [key, value] of Object.entries(after.counters)) if (before.counters[key] !== value) {
    const [owner, kind] = key.split(':'); await tx.query('INSERT INTO counters(tenant_id,kind,value) VALUES($1,$2,$3) ON CONFLICT(tenant_id,kind) DO UPDATE SET value=EXCLUDED.value', [owner, kind, value]);
  }
  const oldAudit = new Set(before.auditLogs.map(a => a.id));
  for (const a of after.auditLogs.filter(a => !oldAudit.has(a.id))) await tx.query('INSERT INTO audit_logs(id,tenant_id,actor_id,actor_name,action,entity,entity_id,summary,diff,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)', [a.id, a.tenantId, a.actorId, a.actorName, a.action, a.entity, a.entityId, a.summary, a.diff ? JSON.stringify(a.diff) : null, a.at]);
  const r = await tx.query<{ revision: string }>('UPDATE tenants SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision', [tenantId]);
  return Number(r.rows[0].revision);
}
export async function enqueueEmail(tx: Database, input: { tenantId?: string; dedupe: string; to: string; subject: string; text: string }): Promise<void> {
  await tx.query('INSERT INTO outbox(id,tenant_id,dedupe_key,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING', [crypto.randomUUID(), input.tenantId ?? null, input.dedupe, input.to.toLowerCase(), input.subject, input.text]);
}
export async function afterDomainEffects(tx: Database, before: DataSet, after: DataSet, tenantId: string, appUrl: string): Promise<void> {
  const oldInvites = new Set(before.invitations.map(i => i.id));
  for (const i of after.invitations.filter(i => !oldInvites.has(i.id) && i.status === 'pending')) {
    const token = randomToken(); await tx.query('UPDATE invitations SET token_hash=$2 WHERE id=$1', [i.id, hash(token)]);
    await enqueueEmail(tx, { tenantId, dedupe: `invite:${i.id}`, to: i.email, subject: 'You are invited to TechPros One', text: `Hello ${i.name},\n\nYou have been invited to join a TechPros One workspace as ${i.role}. Accept or decline this invitation within seven days:\n${appUrl}/accept-invitation?token=${token}\n\nIf you did not expect this invitation, ignore this email. Never share this link.` });
  }
  const oldNotifications = new Set(before.notifications.map(n => n.id));
  const tenant = after.tenants.find(t => t.id === tenantId)!;
  if (tenant.notificationEmails !== false) for (const n of after.notifications.filter(n => !oldNotifications.has(n.id))) {
    const u = after.users.find(u => u.id === n.userId && u.emailVerified && u.status === 'active'); if (!u) continue;
    await enqueueEmail(tx, { tenantId, dedupe: `notification:${n.id}`, to: u.email, subject: n.title, text: `${n.body}\n\n${n.link ? appUrl + n.link : appUrl}\n\nManage email notifications in your account settings.` });
  }
}
export async function snapshot(tx: Database, ctx: AccessContext): Promise<{ data: DataSet; revision: number; serverTime: string }> {
  const loaded = await loadDomain(tx, ctx.tenantId, ctx.userId, { audit: true });
  return { data: projectWorkspace(loaded.data, ctx), revision: loaded.revision, serverTime: new Date().toISOString() };
}
export async function audit(tx: Database, input: { tenantId?: ID; actorId?: ID; actorName?: string; action: string; entity: string; entityId: string; summary: string }): Promise<void> {
  await tx.query('INSERT INTO audit_logs(id,tenant_id,actor_id,actor_name,action,entity,entity_id,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [crypto.randomUUID(), input.tenantId ?? null, input.actorId ?? null, input.actorName ?? 'System', input.action, input.entity, input.entityId, input.summary]);
}

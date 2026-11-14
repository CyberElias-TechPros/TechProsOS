/** Transactional domain core shared by the explicit demo adapter and live API.
 * Callers must clone the dataset before calling and discard it if this throws.
 * No browser storage, network, clock globals or identity lookup occurs here.
 */
import { can, DELEGATABLE_PERMISSIONS, type AccessContext, type Permission } from './permissions';
import { commandSchema, type Command, type RegisterInput } from './contracts';
import type { DataSet, Ticket, ID, Invoice, PaymentRecord } from './types';
import { addBusinessMinutes, addCalendarMonths, businessMinutesBetween, defaultCalendar, DEFAULT_SLA_TARGETS, priorityFrom } from './sla';
import { invoiceBalanceKobo, toKobo, totalsKobo } from './money';
import { projectSpend } from './metrics';

export type { Command } from './contracts';
export class DomainError extends Error {
  constructor(message: string, public code = 'VALIDATION_ERROR', public status = 422) { super(message); this.name = 'DomainError'; }
}
export class PermissionDenied extends DomainError {
  constructor(permission: Permission) { super(`Missing permission: ${permission}`, 'FORBIDDEN', 403); this.name = 'PermissionDenied'; }
}
export interface CommandResult { id?: string; ids?: string[]; count?: number; deduped?: boolean; incidentId?: string; }
interface Outcome { entity: string; id: string; summary: string; result?: CommandResult; }
type Owned = { id: ID; tenantId: ID };
const fail = (message: string, code = 'VALIDATION_ERROR', status = 422): never => { throw new DomainError(message, code, status); };
const notFound = (entity: string): never => fail(`${entity} not found or outside this workspace`, 'NOT_FOUND', 404);
const conflict = (message: string): never => fail(message, 'CONFLICT', 409);

export function emptyData(): DataSet {
  return {
    tenants: [], users: [], memberships: [], invitations: [], branches: [], departments: [], tickets: [], ticketMessages: [], slaPolicies: [],
    assets: [], maintenancePlans: [], workOrders: [], devices: [], alerts: [], projects: [], tasks: [], agreements: [], contacts: [], vendors: [],
    purchaseOrders: [], stockItems: [], invoices: [], expenses: [], budgets: [], articles: [], documents: [], assessments: [], findings: [], risks: [],
    auditLogs: [], notifications: [], reportRuns: [], delegations: [], reportSchedules: [], privacyRequests: [], attachments: [], counters: {},
  };
}
function number(d: DataSet, tenantId: string, kind: string, prefix: string): string {
  const key = `${tenantId}:${kind}`; const n = (d.counters[key] ?? 1000) + 1; d.counters[key] = n; return `${prefix}-${n}`;
}
function member(d: DataSet, tenantId: ID, userId: ID, permission?: Permission) {
  const m = d.memberships.find(x => x.tenantId === tenantId && x.userId === userId && x.status === 'active');
  const u = d.users.find(x => x.id === userId && x.status === 'active');
  if (!m || !u) return notFound('Active workspace member');
  if (permission && !can({ userId, tenantId, role: m.role, delegated: false }, permission)) throw new PermissionDenied(permission);
  return m;
}
export function assignableUsers(d: DataSet, ctx: AccessContext) {
  const direct = d.memberships.filter(m => m.tenantId === ctx.tenantId && m.status === 'active' &&
    can({ userId: m.userId, tenantId: ctx.tenantId, role: m.role, delegated: false }, 'itsm.ticket.update'));
  const ids = new Set(direct.map(m => m.userId));
  for (const g of d.delegations) if (g.tenantId === ctx.tenantId && g.status === 'active' && Date.parse(g.expiresAt) > Date.now() && g.permissions.includes('itsm.ticket.update')) ids.add(g.userId);
  return d.users.filter(u => u.status === 'active' && ids.has(u.id));
}
function assertTransition(from: string, to: string, allowed: Record<string, readonly string[]>) {
  if (from === to) conflict('This record is already in that state');
  if (!allowed[from]?.includes(to)) conflict(`Invalid transition: ${from} → ${to}`);
}
export const TICKET_TRANSITIONS: Record<Ticket['status'], readonly Ticket['status'][]> = {
  new: ['triaged'], triaged: ['in_progress'], assigned: ['in_progress'],
  in_progress: ['pending', 'resolved'], pending: ['in_progress'], resolved: ['closed', 'in_progress'], closed: [],
};

/** Provision defaults, not fictional operational records. Used by live registration. */
export function provisionWorkspace(d: DataSet, input: RegisterInput, ids: { tenantId: ID; userId: ID; branchIds: ID[]; departmentIds: ID[]; policyId: ID }, now: string): void {
  const slug = input.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
  d.tenants.push({ id: ids.tenantId, name: input.orgName, slug: `${slug}-${ids.tenantId.slice(0, 8)}`,
    type: input.type, industry: input.industry, city: input.city, plan: input.type === 'service_provider' ? 'msp_launch' : input.plan,
    status: 'active', createdAt: now, aiAssistCredits: 500, trialEndsAt: new Date(Date.parse(now) + 14 * 86400000).toISOString(), subscriptionStatus: 'trialing', billingEmail: input.ownerEmail });
  d.memberships.push({ userId: ids.userId, tenantId: ids.tenantId, role: 'org_owner', status: 'active' });
  input.branches.forEach((b, i) => d.branches.push({ id: ids.branchIds[i], tenantId: ids.tenantId, name: b.name, city: b.city, address: b.city, status: 'active' }));
  input.departments.forEach((name, i) => d.departments.push({ id: ids.departmentIds[i], tenantId: ids.tenantId, branchId: ids.branchIds[0], name }));
  d.slaPolicies.push({ id: ids.policyId, tenantId: ids.tenantId, name: 'Standard business-hours SLA', targets: DEFAULT_SLA_TARGETS, ...defaultCalendar(), timezone: 'Africa/Lagos' });
  d.auditLogs.unshift({ id: crypto.randomUUID(), tenantId: ids.tenantId, actorId: ids.userId, actorName: input.ownerName, action: 'org.registered', entity: 'tenant', entityId: ids.tenantId, summary: 'Workspace provisioned', at: now });
}

export function applyCommand(original: DataSet, ctx: AccessContext, rawCommand: Command, options: { now?: Date; demo?: boolean } = {}): { data: DataSet; result: CommandResult } {
  const parsed = commandSchema.safeParse(rawCommand);
  if (!parsed.success) throw new DomainError(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const command = parsed.data;
  if (command.type === 'device.simulate_outage' && !options.demo) fail('Outage simulation is unavailable in live workspaces');
  const d = original;
  const nowDate = options.now ?? new Date(); const now = nowDate.toISOString(); const nowMs = nowDate.getTime();
  const tenant = d.tenants.find(t => t.id === ctx.tenantId) ?? notFound('Workspace');
  if (tenant.status !== 'active') fail('Workspace is suspended', 'FORBIDDEN', 403);
  if (!ctx.delegated) member(d, ctx.tenantId, ctx.userId);
  else if (!can(ctx, 'itsm.ticket.view.own', nowMs) && !ctx.grantedPermissions?.some(p => can(ctx, p, nowMs))) throw new PermissionDenied('itsm.ticket.view.own');
  const subscriptionLapsed = tenant.subscriptionStatus === 'active' ? !!tenant.subscriptionExpiresAt && Date.parse(tenant.subscriptionExpiresAt) < nowMs : !!tenant.trialEndsAt && Date.parse(tenant.trialEndsAt) < nowMs;
  if (!options.demo && subscriptionLapsed &&
      !['notification.read', 'privacy.request', 'report.run'].includes(command.type)) fail('Trial ended. Subscribe to continue changing operational records; exports remain available.', 'SUBSCRIPTION_REQUIRED', 402);
  const require = (p: Permission) => { if (!can(ctx, p, nowMs)) throw new PermissionDenied(p); };
  const get = <T extends Owned>(rows: T[], id: ID, label = 'Record'): T => rows.find(x => x.id === id && x.tenantId === ctx.tenantId) ?? notFound(label);
  const userName = (id: ID) => d.users.find(u => u.id === id)?.name ?? 'System';
  const notify = (userId: ID, title: string, body: string, link?: string) => {
    if (d.users.some(u => u.id === userId && u.status === 'active')) d.notifications.unshift({ id: crypto.randomUUID(), tenantId: ctx.tenantId, userId, title, body, link, at: now, read: false });
  };
  const notifyManagers = (title: string, body: string, link?: string) => {
    for (const m of d.memberships.filter(m => m.tenantId === ctx.tenantId && m.status === 'active' && ['org_owner', 'org_admin', 'it_manager', 'svc_delivery_manager'].includes(m.role))) notify(m.userId, title, body, link);
  };
  const branch = (id?: ID) => { if (id) { const b = get(d.branches, id, 'Branch'); if (b.status !== 'active') fail('Branch is closed'); } };
  const department = (id?: ID, branchId?: ID) => { if (id) { const dep = get(d.departments, id, 'Department'); if (branchId && dep.branchId !== branchId) fail('Department does not belong to the selected branch'); } };
  const asset = (id?: ID) => { if (id) { const a = get(d.assets, id, 'Asset'); if (['disposed', 'retired'].includes(a.lifecycle)) fail('Retired or disposed assets cannot be linked to new work'); return a; } return undefined; };
  const project = (id?: ID) => id ? get(d.projects, id, 'Project') : undefined;
  const client = (id?: ID) => { if (id) { const t = d.tenants.find(t => t.id === id && t.providerId === ctx.tenantId) ?? notFound('Client'); if (tenant.type !== 'service_provider') fail('Only provider workspaces can link clients'); return t; } return undefined; };
  const policy = () => d.slaPolicies.find(p => p.tenantId === ctx.tenantId);
  const cal = () => policy() ?? { ...defaultCalendar(), timezone: 'Africa/Lagos' };
  const makeTicket = (input: Extract<Command, { type: 'ticket.create' }>['input'], requesterId: ID, source: Ticket['source'] = 'portal') => {
    branch(input.branchId); department(input.departmentId, input.branchId); const linked = asset(input.assetId);
    if (input.kind === 'change' && (!input.changePlan?.trim() || !input.rollbackPlan?.trim() || !input.scheduledAt)) fail('Changes require an implementation plan, rollback plan and schedule');
    const priority = priorityFrom(input.impact, input.urgency); const targets = policy()?.targets ?? DEFAULT_SLA_TARGETS;
    const t: Ticket = { id: crypto.randomUUID(), tenantId: ctx.tenantId, number: number(d, ctx.tenantId, 'ticket', 'TKT'),
      ...input, source, requesterId, branchId: input.branchId ?? linked?.branchId, priority, priorityOverridden: false, status: 'new', slaPolicyId: policy()?.id,
      responseDueAt: addBusinessMinutes(now, targets[priority].response, cal()), resolveDueAt: addBusinessMinutes(now, targets[priority].resolve, cal()), createdAt: now, updatedAt: now };
    d.tickets.unshift(t); return t;
  };
  const receiveOutage = (deviceId: ID) => {
    const device = get(d.devices, deviceId, 'Device');
    const existing = d.alerts.find(a => a.tenantId === ctx.tenantId && a.deviceId === deviceId && a.status !== 'resolved');
    if (existing) return { id: existing.id, deduped: true };
    device.status = 'down'; device.packetLossPct = 100; device.lastSeenAt = now;
    const ticket = makeTicket({ kind: 'incident', title: `Infrastructure outage: ${device.name}`, description: `Monitoring detected that ${device.name} stopped responding. Investigate the device and its uplink.`, category: 'Network & connectivity', impact: 'high', urgency: 'high', branchId: device.branchId }, ctx.userId, 'monitoring');
    const id = crypto.randomUUID(); d.alerts.unshift({ id, tenantId: ctx.tenantId, deviceId, severity: 'critical', message: `${device.name} is unreachable`, status: 'active', incidentId: ticket.id, createdAt: now });
    notifyManagers('Critical infrastructure alert', `${device.name} · ${ticket.number}`, `/app/service-desk/${ticket.id}`);
    return { id, deduped: false, incidentId: ticket.id };
  };
  const createAsset = (input: Extract<Command, { type: 'asset.create' }>['input'], lifecycle: 'in_service' | 'in_storage' = 'in_service') => {
    branch(input.branchId); department(input.departmentId, input.branchId);
    if (input.assigneeId) member(d, ctx.tenantId, input.assigneeId);
    if (input.serial && d.assets.some(a => a.tenantId === ctx.tenantId && a.serial === input.serial)) conflict('An asset with this serial already exists');
    if (input.warrantyExpiry && Date.parse(input.warrantyExpiry) < Date.parse(input.purchaseDate)) fail('Warranty cannot expire before purchase');
    const id = crypto.randomUUID(); const tag = number(d, ctx.tenantId, 'asset', 'TP');
    d.assets.push({ ...input, id, tenantId: ctx.tenantId, tag, lifecycle, condition: 'good', createdAt: now }); return id;
  };
  const recordPayment = (invoice: Invoice, payment: PaymentRecord) => {
    if (invoice.status === 'draft' || invoice.status === 'cancelled') conflict('Issue the invoice before recording settlement');
    if (toKobo(payment.amount) > invoiceBalanceKobo(invoice)) fail('Payment exceeds the outstanding invoice balance');
    if (payment.method === 'withholding_credit' && !payment.creditNoteRef) fail('A withholding credit note/reference is required');
    const all = [...(invoice.payments ?? []), payment];
    if (all.some((p, i) => p.reference === payment.reference && p.method === payment.method && all.findIndex(x => x.reference === p.reference && x.method === p.method) !== i)) conflict('This payment reference has already been recorded');
    invoice.payments = all; invoice.status = invoiceBalanceKobo(invoice) === 0 ? 'paid' : 'partial';
    if (invoice.status === 'paid') invoice.paidAt = payment.at;
  };
  let o: Outcome;
  switch (command.type) {
    case 'tenant.update': {
      require('admin.org');
      const { type: _type, ...patch } = command; Object.assign(tenant, patch);
      o = { entity: 'tenant', id: tenant.id, summary: 'Updated organisation settings' }; break;
    }
    case 'sla.update': {
      require('admin.org');
      if (command.workStartHour >= command.workEndHour) fail('Workday end must be after its start');
      if (new Set(command.workDays).size !== command.workDays.length) fail('Duplicate working days');
      for (const holiday of command.holidays) if (!Number.isFinite(Date.parse(holiday))) fail('Invalid holiday date');
      for (const target of Object.values(command.targets)) if (target.response > target.resolve) fail('Response target cannot exceed resolution target');
      const { type: _type, ...patch } = command; const p = policy();
      if (p) Object.assign(p, patch); else d.slaPolicies.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, ...patch });
      o = { entity: 'slaPolicy', id: policy()!.id, summary: 'Updated SLA policy; existing ticket deadlines are preserved' }; break;
    }
    case 'branch.create': {
      require('admin.org'); const id = crypto.randomUUID();
      d.branches.push({ id, tenantId: ctx.tenantId, name: command.name, city: command.city, address: command.city, status: 'active' });
      o = { entity: 'branch', id, summary: 'Created branch', result: { id } }; break;
    }
    case 'department.create': {
      require('admin.org'); branch(command.branchId); const id = crypto.randomUUID();
      d.departments.push({ id, tenantId: ctx.tenantId, name: command.name, branchId: command.branchId });
      o = { entity: 'department', id, summary: 'Created department', result: { id } }; break;
    }
    case 'user.invite': {
      require('admin.users');
      if (command.role === 'org_owner' && ctx.role !== 'org_owner') fail('Only the owner may invite another owner');
      if (command.role.startsWith('svc_') && tenant.type !== 'service_provider') fail('Provider role requires a provider workspace');
      if (d.memberships.some(m => m.tenantId === ctx.tenantId && m.status === 'active' && d.users.find(u => u.id === m.userId)?.email === command.email)) conflict('This email is already a workspace member');
      if (d.invitations.some(i => i.tenantId === ctx.tenantId && i.email === command.email && i.status === 'pending' && Date.parse(i.expiresAt) > nowMs)) conflict('A pending invitation already exists for this email');
      const id = crypto.randomUUID(); d.invitations.push({ id, tenantId: ctx.tenantId, name: command.name, email: command.email, role: command.role, status: 'pending', createdAt: now, expiresAt: new Date(nowMs + 7 * 86400000).toISOString() });
      o = { entity: 'invitation', id, summary: `Invitation created for ${command.email}`, result: { id } }; break;
    }
    case 'user.role': {
      require('admin.users'); const m = member(d, ctx.tenantId, command.userId);
      if (command.role === 'org_owner' && ctx.role !== 'org_owner') fail('Only an owner can grant ownership');
      if (m.role === 'org_owner' && ctx.role !== 'org_owner') fail('Only an owner can change an owner');
      if (m.role === 'org_owner' && command.role !== 'org_owner' && d.memberships.filter(x => x.tenantId === ctx.tenantId && x.status === 'active' && x.role === 'org_owner').length <= 1) fail('Transfer ownership before removing the last owner');
      if (command.userId === ctx.userId && command.role !== m.role) fail('Another administrator must change your role');
      const from = m.role; m.role = command.role;
      o = { entity: 'membership', id: command.userId, summary: `Role changed for ${userName(command.userId)}: ${from} → ${command.role}` }; break;
    }
    case 'user.deactivate': {
      require('admin.users'); const m = member(d, ctx.tenantId, command.userId);
      if (command.userId === ctx.userId || m.role === 'org_owner') fail('Cannot deactivate yourself or an owner; transfer ownership first');
      m.status = 'suspended';
      for (const t of d.tickets) if (t.tenantId === ctx.tenantId && t.assigneeId === command.userId && !['closed', 'resolved'].includes(t.status)) { t.assigneeId = undefined; if (t.status === 'assigned') t.status = 'triaged'; t.updatedAt = now; }
      o = { entity: 'membership', id: command.userId, summary: 'Member access revoked; open assignments returned to triage' }; break;
    }
    case 'invitation.revoke': {
      require('admin.users'); const i = get(d.invitations, command.id, 'Invitation'); if (i.status !== 'pending') conflict('Invitation is no longer pending'); i.status = 'revoked';
      o = { entity: 'invitation', id: i.id, summary: 'Invitation revoked' }; break;
    }
    case 'delegation.grant': {
      require('clients.client.manage'); const target = client(command.clientTenantId)!; member(d, ctx.tenantId, command.userId);
      if (Date.parse(command.expiresAt) <= nowMs || Date.parse(command.expiresAt) > nowMs + 366 * 86400000) fail('Grant must expire within one year');
      const permissions = [...new Set(command.permissions)].filter(p => DELEGATABLE_PERMISSIONS.includes(p));
      if (!permissions.length) fail('No delegatable permissions selected');
      const existing = d.delegations.find(g => g.tenantId === target.id && g.userId === command.userId && g.status === 'active');
      if (existing) { existing.permissions = permissions; existing.expiresAt = command.expiresAt; o = { entity: 'delegation', id: existing.id, summary: 'Client access grant updated' }; }
      else { const id = crypto.randomUUID(); d.delegations.push({ id, tenantId: target.id, providerId: ctx.tenantId, userId: command.userId, permissions, expiresAt: command.expiresAt, status: 'active', createdBy: ctx.userId, createdAt: now }); o = { entity: 'delegation', id, summary: 'Explicit client access granted', result: { id } }; }
      break;
    }
    case 'delegation.revoke': {
      require('clients.client.manage'); const g = get(d.delegations, command.id, 'Delegation'); client(g.tenantId); g.status = 'revoked';
      o = { entity: 'delegation', id: g.id, summary: 'Client access revoked' }; break;
    }
    case 'ticket.create': {
      require('itsm.ticket.create'); const requester = command.input.requesterId ?? ctx.userId;
      if (requester !== ctx.userId) { require('itsm.ticket.assign'); member(d, ctx.tenantId, requester); }
      const t = makeTicket(command.input, requester, command.input.source ?? 'portal');
      o = { entity: 'ticket', id: t.id, summary: `Opened ${t.number}`, result: { id: t.id } }; break;
    }
    case 'ticket.assign': {
      require('itsm.ticket.assign'); const t = get(d.tickets, command.ticketId, 'Ticket');
      if (['resolved', 'closed'].includes(t.status)) conflict('Reopen the ticket before assigning');
      if (!assignableUsers(d, ctx).some(u => u.id === command.assigneeId)) fail('Assignee is not an active support member');
      t.assigneeId = command.assigneeId; if (['new', 'triaged'].includes(t.status)) t.status = 'assigned'; t.updatedAt = now;
      notify(command.assigneeId, 'Ticket assigned to you', t.number, `/app/service-desk/${t.id}`);
      o = { entity: 'ticket', id: t.id, summary: `${t.number} assigned` }; break;
    }
    case 'ticket.status': {
      const t = get(d.tickets, command.ticketId, 'Ticket'); const ownRequester = t.requesterId === ctx.userId;
      if (command.status === 'closed' && ownRequester) require('itsm.ticket.view.own'); else require('itsm.ticket.update');
      assertTransition(t.status, command.status, TICKET_TRANSITIONS);
      if (command.status === 'assigned') conflict('Use assignment to select an assignee');
      if (['in_progress', 'pending', 'resolved'].includes(command.status) && !t.assigneeId && !ownRequester) fail('Assign the ticket before work begins');
      if (command.status === 'resolved' && (!command.resolutionSummary || command.resolutionSummary.trim().length < 10)) fail('A resolution summary of at least 10 characters is required');
      if (command.status === 'pending' && !command.pendingReason?.trim()) fail('Explain what the ticket is waiting for');
      if (t.kind === 'change' && ['in_progress', 'resolved'].includes(command.status) && !t.approvedBy) fail('Change approval is required before implementation');
      if (command.resolutionArticleId) { const a = get(d.articles, command.resolutionArticleId, 'Article'); if (a.status !== 'published') fail('Resolution article must be published'); t.resolutionArticleId = a.id; }
      if (command.status === 'pending') { t.pausedAt = now; t.pendingReason = command.pendingReason; }
      if (t.status === 'pending' && t.pausedAt && command.status === 'in_progress') {
        const paused = businessMinutesBetween(t.pausedAt, now, cal());
        if (t.responseDueAt && !t.firstResponseAt) t.responseDueAt = addBusinessMinutes(t.responseDueAt, paused, cal());
        if (t.resolveDueAt) t.resolveDueAt = addBusinessMinutes(t.resolveDueAt, paused, cal());
        t.pausedMs = (t.pausedMs ?? 0) + nowMs - Date.parse(t.pausedAt); t.pausedAt = undefined; t.pendingReason = undefined;
      }
      const from = t.status; t.status = command.status; t.updatedAt = now;
      if (command.status === 'in_progress' && !t.firstResponseAt && !ownRequester) t.firstResponseAt = now;
      if (command.status === 'resolved') { t.resolvedAt = now; t.resolutionSummary = command.resolutionSummary!.trim(); t.closedAt = undefined; }
      if (command.status === 'closed') t.closedAt = now;
      notify(t.requesterId, `${t.number} ${command.status.replace('_', ' ')}`, t.title, `/app/service-desk/${t.id}`);
      o = { entity: 'ticket', id: t.id, summary: `${t.number}: ${from} → ${command.status}` }; break;
    }
    case 'ticket.approve': {
      require('itsm.ticket.assign'); const t = get(d.tickets, command.ticketId, 'Ticket');
      if (t.kind !== 'change' || t.status === 'closed' || t.status === 'resolved') fail('Only an open change can be approved');
      if (t.requesterId === ctx.userId) fail('A different approver must approve this change');
      if (!t.changePlan || !t.rollbackPlan || !t.scheduledAt) fail('Change plan, rollback plan and schedule are required');
      t.approvedBy = ctx.userId; t.updatedAt = now; o = { entity: 'ticket', id: t.id, summary: `${t.number} change approved` }; break;
    }
    case 'ticket.message': {
      const t = get(d.tickets, command.ticketId, 'Ticket');
      const staff = can(ctx, 'itsm.ticket.update', nowMs);
      const involved = t.requesterId === ctx.userId || t.assigneeId === ctx.userId;
      const team = can(ctx, 'itsm.ticket.view.team', nowMs) && ((!ctx.branchId && !ctx.departmentId) || t.branchId === ctx.branchId || t.departmentId === ctx.departmentId || !t.assigneeId);
      if (!staff && !involved && !team && !can(ctx, 'itsm.ticket.view.all', nowMs)) throw new PermissionDenied('itsm.ticket.update');
      if (command.internal && !staff) throw new PermissionDenied('itsm.ticket.update');
      if (t.status === 'closed') conflict('Closed tickets are read-only');
      d.ticketMessages.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, ticketId: t.id, authorId: ctx.userId, body: command.body, internal: command.internal, createdAt: now });
      t.updatedAt = now; if (!command.internal && staff && !t.firstResponseAt) t.firstResponseAt = now;
      if (!command.internal) notify(t.requesterId === ctx.userId && t.assigneeId ? t.assigneeId : t.requesterId, `Update on ${t.number}`, 'A new reply is available', `/app/service-desk/${t.id}`);
      o = { entity: 'ticket', id: t.id, summary: `${t.number}: ${command.internal ? 'internal note' : 'reply'} added` }; break;
    }
    case 'ticket.rate': {
      const t = get(d.tickets, command.ticketId, 'Ticket'); if (t.requesterId !== ctx.userId) throw new PermissionDenied('itsm.ticket.view.own');
      if (!['resolved', 'closed'].includes(t.status)) fail('Rate the ticket after resolution'); if (t.csat) conflict('Feedback has already been recorded');
      t.csat = command.score; t.updatedAt = now; o = { entity: 'ticket', id: t.id, summary: `${t.number}: satisfaction ${command.score}/5` }; break;
    }
    case 'asset.create': { require('assets.asset.create'); const id = createAsset(command.input); o = { entity: 'asset', id, summary: 'Asset registered', result: { id } }; break; }
    case 'asset.import': {
      require('assets.asset.create'); const ids = command.rows.map(row => createAsset(row));
      o = { entity: 'asset', id: ids[0], summary: `Imported ${ids.length} assets atomically`, result: { ids, count: ids.length } }; break;
    }
    case 'asset.update': {
      const a = get(d.assets, command.assetId, 'Asset');
      const transfer = command.patch.branchId !== undefined || command.patch.assigneeId !== undefined || command.patch.departmentId !== undefined;
      require(transfer ? 'assets.asset.transfer' : 'assets.asset.update');
      if (command.patch.lifecycle === 'disposed') require('assets.asset.dispose');
      if (a.lifecycle === 'disposed') conflict('Disposed assets are terminal');
      branch(command.patch.branchId); department(command.patch.departmentId, command.patch.branchId ?? a.branchId);
      if (command.patch.assigneeId) member(d, ctx.tenantId, command.patch.assigneeId);
      if (command.patch.serial && d.assets.some(x => x.tenantId === ctx.tenantId && x.id !== a.id && x.serial === command.patch.serial)) conflict('Serial already registered');
      if (['retired', 'disposed'].includes(command.patch.lifecycle ?? '')) { command.patch.assigneeId = undefined; }
      Object.assign(a, command.patch); o = { entity: 'asset', id: a.id, summary: `Updated ${a.tag}` }; break;
    }
    case 'workorder.create': {
      require('maintenance.workorder.manage'); const a = asset(command.assetId); branch(command.branchId ?? a?.branchId);
      if (command.assigneeId) member(d, ctx.tenantId, command.assigneeId, 'maintenance.workorder.manage');
      if (command.planId) get(d.maintenancePlans, command.planId, 'Maintenance plan');
      const id = crypto.randomUUID(); const woNumber = number(d, ctx.tenantId, 'workorder', 'WO');
      d.workOrders.unshift({ id, tenantId: ctx.tenantId, number: woNumber, title: command.title, kind: command.kind, assetId: command.assetId, planId: command.planId, branchId: command.branchId ?? a?.branchId, assigneeId: command.assigneeId, status: 'open', dueAt: command.dueAt, checklist: command.checklist.map(item => ({ item, done: false })), createdAt: now });
      if (command.assigneeId) notify(command.assigneeId, 'New work order', command.title, '/app/maintenance');
      o = { entity: 'workorder', id, summary: `Created ${woNumber}`, result: { id } }; break;
    }
    case 'workorder.status': {
      require('maintenance.workorder.manage'); const w = get(d.workOrders, command.id, 'Work order');
      assertTransition(w.status, command.status, { open: ['scheduled', 'in_progress', 'cancelled'], scheduled: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] });
      if (command.assigneeId) member(d, ctx.tenantId, command.assigneeId, 'maintenance.workorder.manage');
      if (command.status === 'completed') {
        if (w.checklist.some(i => !i.done) || !command.signOffBy?.trim() || command.labourHours === undefined || command.cost === undefined || !command.notes?.trim()) fail('Complete every checklist item and provide labour, cost, report and sign-off');
        w.completedAt = now;
      }
      const { type: _type, id: _id, status: _status, ...patch } = command;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (w as unknown as Record<string, unknown>)[k] = v;
      w.status = command.status; o = { entity: 'workorder', id: w.id, summary: `${w.number} → ${command.status}` }; break;
    }
    case 'workorder.checklist': {
      require('maintenance.workorder.manage'); const w = get(d.workOrders, command.workOrderId, 'Work order'); if (['completed', 'cancelled'].includes(w.status)) conflict('Work order is terminal');
      const item = w.checklist[command.index] ?? notFound('Checklist item'); item.done = !item.done;
      o = { entity: 'workorder', id: w.id, summary: `${w.number}: checklist updated` }; break;
    }
    case 'maintenance.plan': {
      require('maintenance.plan.manage'); member(d, ctx.tenantId, command.assigneeId, 'maintenance.workorder.manage'); const id = crypto.randomUUID();
      const { type: _type, ...input } = command; d.maintenancePlans.push({ id, tenantId: ctx.tenantId, active: true, ...input });
      o = { entity: 'maintenancePlan', id, summary: 'Preventive plan created', result: { id } }; break;
    }
    case 'maintenance.pause': {
      require('maintenance.plan.manage'); const p = get(d.maintenancePlans, command.id, 'Maintenance plan'); p.active = command.active;
      o = { entity: 'maintenancePlan', id: p.id, summary: `Plan ${command.active ? 'resumed' : 'paused'}` }; break;
    }
    case 'maintenance.run': {
      require('maintenance.plan.manage'); let count = 0;
      for (const p of d.maintenancePlans.filter(p => p.tenantId === ctx.tenantId && p.active && Date.parse(p.nextRunAt) <= nowMs)) {
        member(d, ctx.tenantId, p.assigneeId, 'maintenance.workorder.manage');
        const assets = d.assets.filter(a => a.tenantId === ctx.tenantId && a.category === p.assetCategory && a.lifecycle === 'in_service');
        const occurrence = p.nextRunAt;
        for (const a of assets) {
          if (d.workOrders.some(w => w.tenantId === ctx.tenantId && w.planId === p.id && w.assetId === a.id && w.dueAt === occurrence)) continue;
          d.workOrders.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, number: number(d, ctx.tenantId, 'workorder', 'WO'), title: `${p.name} — ${a.name}`, kind: 'preventive', planId: p.id, assetId: a.id, branchId: a.branchId, assigneeId: p.assigneeId, status: 'scheduled', dueAt: occurrence, checklist: p.checklist.map(item => ({ item, done: false })), createdAt: now }); count++;
        }
        let next = occurrence; let guard = 0;
        do { next = addCalendarMonths(next, p.intervalMonths); if (++guard > 1200) fail('Maintenance plan is too far behind; review its schedule'); } while (Date.parse(next) <= nowMs);
        p.nextRunAt = next;
      }
      o = { entity: 'maintenancePlan', id: ctx.tenantId, summary: `Scheduler generated ${count} work orders`, result: { count } }; break;
    }
    case 'device.create': {
      require('infrastructure.device.manage'); branch(command.branchId); if (command.parentId) get(d.devices, command.parentId, 'Parent device');
      const id = crypto.randomUUID(); const { type: _type, ...input } = command;
      d.devices.push({ ...input, id, tenantId: ctx.tenantId, status: 'up', latencyMs: 0, packetLossPct: 0, lastSeenAt: now });
      o = { entity: 'device', id, summary: 'Device registered; awaiting real telemetry', result: { id } }; break;
    }
    case 'device.update': {
      require('infrastructure.device.manage'); const device = get(d.devices, command.id, 'Device');
      if (command.parentId) {
        const parent = get(d.devices, command.parentId, 'Parent device'); const seen = new Set([device.id]); let cursor = parent;
        while (cursor) { if (seen.has(cursor.id)) fail('Topology cannot contain a cycle'); seen.add(cursor.id); cursor = d.devices.find(x => x.tenantId === ctx.tenantId && x.id === cursor.parentId)!; }
      }
      const { type: _type, id: _id, ...patch } = command; Object.assign(device, patch);
      o = { entity: 'device', id: device.id, summary: 'Device configuration updated' }; break;
    }
    case 'device.simulate_outage': {
      require('infrastructure.device.manage'); const r = receiveOutage(command.deviceId);
      o = { entity: 'device', id: command.deviceId, summary: r.deduped ? 'Existing outage deduplicated' : 'Fictional outage raised', result: r }; break;
    }
    case 'alert.ack': case 'alert.resolve': {
      require('infrastructure.alert.manage'); const a = get(d.alerts, command.id, 'Alert');
      if (a.status === 'resolved') conflict('Alert is already resolved');
      if (command.type === 'alert.ack') { if (a.status !== 'active') conflict('Alert already acknowledged'); a.status = 'acknowledged'; a.ackAt = now; }
      else { a.status = 'resolved'; a.resolvedAt = now; }
      o = { entity: 'alert', id: a.id, summary: `Alert ${a.status}; device health is changed only by telemetry` }; break;
    }
    case 'project.create': {
      require('projects.project.manage'); member(d, ctx.tenantId, command.managerId, 'projects.project.manage'); client(command.clientTenantId); branch(command.branchId);
      if (Date.parse(command.dueAt) < nowMs) fail('Project due date must be in the future'); const id = crypto.randomUUID();
      const { type: _type, ...input } = command; d.projects.unshift({ ...input, id, tenantId: ctx.tenantId, status: 'planning', spent: 0, startAt: now, milestones: [], createdAt: now });
      o = { entity: 'project', id, summary: 'Project created', result: { id } }; break;
    }
    case 'project.status': {
      require('projects.project.manage'); const p = get(d.projects, command.id, 'Project');
      assertTransition(p.status, command.status, { planning: ['in_progress', 'on_hold'], in_progress: ['on_hold', 'completed'], on_hold: ['in_progress'], completed: [] });
      if (command.status === 'completed' && (p.milestones.some(m => !m.done) || d.tasks.some(t => t.tenantId === ctx.tenantId && t.projectId === p.id && t.column !== 'done'))) fail('Complete all tasks and milestones before handover');
      p.status = command.status; p.spent = projectSpend(d, p.id); o = { entity: 'project', id: p.id, summary: `Project → ${command.status}` }; break;
    }
    case 'task.create': {
      require('projects.project.manage'); const p = get(d.projects, command.projectId, 'Project'); if (p.status === 'completed') conflict('Project is completed');
      if (command.assigneeId) member(d, ctx.tenantId, command.assigneeId); const id = crypto.randomUUID();
      d.tasks.push({ id, tenantId: ctx.tenantId, projectId: p.id, title: command.title, column: command.column, assigneeId: command.assigneeId, priority: 'medium', dueAt: command.dueAt, createdAt: now });
      o = { entity: 'task', id, summary: 'Task created', result: { id } }; break;
    }
    case 'task.move': {
      require('projects.project.manage'); const t = get(d.tasks, command.taskId, 'Task'); const p = get(d.projects, t.projectId, 'Project'); if (p.status === 'completed') conflict('Project is completed');
      t.column = command.column; o = { entity: 'task', id: t.id, summary: `Task → ${command.column}` }; break;
    }
    case 'milestone.create': {
      require('projects.project.manage'); const p = get(d.projects, command.projectId, 'Project'); if (p.status === 'completed') conflict('Project is completed'); const id = crypto.randomUUID();
      p.milestones.push({ id, title: command.title, dueAt: command.dueAt, done: false }); o = { entity: 'project', id: p.id, summary: 'Milestone added', result: { id } }; break;
    }
    case 'milestone.toggle': {
      require('projects.project.manage'); const p = get(d.projects, command.projectId, 'Project'); if (p.status === 'completed') conflict('Project is completed');
      const m = p.milestones.find(m => m.id === command.milestoneId) ?? notFound('Milestone'); m.done = !m.done; p.spent = projectSpend(d, p.id);
      o = { entity: 'project', id: p.id, summary: `Milestone ${m.done ? 'completed' : 'reopened'}` }; break;
    }
    case 'client.onboard': {
      require('clients.client.manage'); if (tenant.type !== 'service_provider') fail('Switch to a provider workspace'); const id = crypto.randomUUID();
      d.tenants.push({ id, name: command.name, slug: `${command.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(0, 8)}`, type: 'organisation', industry: command.industry, city: command.city, plan: 'professional', status: 'active', providerId: ctx.tenantId, createdAt: now, aiAssistCredits: 0 });
      d.branches.push({ id: crypto.randomUUID(), tenantId: id, name: `${command.city} HQ`, city: command.city, address: command.city, status: 'active' });
      d.slaPolicies.push({ id: crypto.randomUUID(), tenantId: id, name: 'Client SLA', targets: DEFAULT_SLA_TARGETS, ...defaultCalendar(), timezone: 'Africa/Lagos' });
      d.contacts.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, clientTenantId: id, name: command.contactName, role: 'Primary contact', email: command.contactEmail, phone: '', primary: true });
      d.agreements.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, clientTenantId: id, name: `${command.tier} managed IT services`, tier: command.tier, monthlyFee: command.monthlyFee, startsAt: now, renewsAt: addCalendarMonths(now, 12), status: 'active' });
      o = { entity: 'client', id, summary: 'Client workspace provisioned without inherited access', result: { id } }; break;
    }
    case 'vendor.create': {
      require('procurement.vendor.manage'); const id = crypto.randomUUID(); const { type: _type, ...input } = command;
      d.vendors.push({ ...input, id, tenantId: ctx.tenantId, rating: 0, status: 'active' }); o = { entity: 'vendor', id, summary: 'Vendor registered', result: { id } }; break;
    }
    case 'po.create': {
      require('procurement.po.create'); const vendor = get(d.vendors, command.vendorId, 'Vendor'); if (vendor.status !== 'active') fail('Vendor is inactive'); branch(command.branchId);
      if (command.items.some(i => !Number.isFinite(i.qty * i.unitCost))) fail('Invalid line total'); const id = crypto.randomUUID();
      d.purchaseOrders.unshift({ id, tenantId: ctx.tenantId, number: number(d, ctx.tenantId, 'po', 'PO'), vendorId: vendor.id, status: 'requested', items: command.items, requestedBy: ctx.userId, branchId: command.branchId, note: command.note, createdAt: now });
      notifyManagers('Purchase approval requested', `${d.purchaseOrders[0].number} · ${vendor.name}`, '/app/procurement');
      o = { entity: 'purchaseOrder', id, summary: 'Purchase requisition submitted', result: { id } }; break;
    }
    case 'po.status': {
      const po = get(d.purchaseOrders, command.id, 'Purchase order');
      if (command.status === 'cancelled' && po.requestedBy === ctx.userId && po.status === 'requested') require('procurement.po.create');
      else if (command.status === 'ordered' || command.status === 'received') require('procurement.po.create'); else require('procurement.po.approve');
      assertTransition(po.status, command.status, { requested: ['approved', 'cancelled'], approved: ['ordered', 'cancelled'], ordered: ['received'], received: [], cancelled: [] });
      if (command.status === 'approved' && po.requestedBy === ctx.userId) fail('A different approver must approve this requisition');
      if (command.status === 'received') {
        const b = command.receivedBranchId ?? po.branchId ?? fail('Receiving branch is required'); branch(b);
        for (const item of po.items) {
          if (item.kind === 'capital') for (let i = 0; i < item.qty; i++) createAsset({ name: item.name, category: 'Received capital equipment', manufacturer: '', model: '', serial: '', branchId: b, purchaseDate: now.slice(0, 10), purchaseCost: item.unitCost, usefulLifeYears: 4 }, 'in_storage');
          else {
            const stock = d.stockItems.find(s => s.tenantId === ctx.tenantId && s.name === item.name && s.branchId === b);
            if (stock) stock.qty += item.qty;
            else d.stockItems.push({ id: crypto.randomUUID(), tenantId: ctx.tenantId, name: item.name, sku: number(d, ctx.tenantId, 'sku', 'SKU'), category: 'Consumables', qty: item.qty, reorderLevel: Math.max(1, Math.ceil(item.qty * .25)), unitCost: item.unitCost, branchId: b });
          }
        }
        po.receivedAt = now; po.receivedBy = ctx.userId; po.receivedBranchId = b;
      }
      po.status = command.status; if (command.status === 'approved') po.approvedBy = ctx.userId;
      o = { entity: 'purchaseOrder', id: po.id, summary: `${po.number} → ${command.status}` }; break;
    }
    case 'stock.adjust': {
      require('procurement.stock.manage'); const s = get(d.stockItems, command.id, 'Stock item'); if (s.qty + command.delta < 0) fail('Stock cannot be negative'); s.qty += command.delta;
      o = { entity: 'stock', id: s.id, summary: `Stock adjustment ${command.delta}: ${command.reason}` }; break;
    }
    case 'invoice.create': {
      require('finance.invoice.manage'); client(command.clientTenantId); totalsKobo(command.items, command.vatRate, command.whtRate); const id = crypto.randomUUID();
      const { type: _type, dueDays, ...input } = command;
      d.invoices.unshift({ ...input, id, tenantId: ctx.tenantId, number: number(d, ctx.tenantId, 'invoice', 'INV'), status: 'draft', issuedAt: now, dueAt: new Date(nowMs + dueDays * 86400000).toISOString(), createdBy: ctx.userId, payments: [] });
      o = { entity: 'invoice', id, summary: 'Invoice draft created', result: { id } }; break;
    }
    case 'invoice.status': {
      require('finance.invoice.manage'); const i = get(d.invoices, command.id, 'Invoice');
      assertTransition(i.status, command.status, { draft: ['sent', 'cancelled'], sent: ['cancelled'], partial: [], paid: [], overdue: ['cancelled'], cancelled: [] });
      if (command.status === 'cancelled' && (i.payments?.length)) fail('Settled or partially paid invoices cannot be cancelled; use a credit/refund process');
      if (command.status === 'sent') i.issuedAt = now; i.status = command.status;
      o = { entity: 'invoice', id: i.id, summary: `${i.number} → ${command.status}` }; break;
    }
    case 'payment.record': {
      require('finance.invoice.manage'); const i = get(d.invoices, command.invoiceId, 'Invoice');
      if (command.method === 'withholding_credit' && i.whtRate === 0) fail('This invoice has no withholding deduction');
      const credits = (i.payments ?? []).filter(p => p.method === 'withholding_credit').reduce((n, p) => n + toKobo(p.amount), 0);
      if (command.method === 'withholding_credit' && credits + toKobo(command.amount) > totalsKobo(i.items, i.vatRate, i.whtRate).wht) fail('Credit exceeds the invoice withholding amount');
      const p: PaymentRecord = { id: crypto.randomUUID(), amount: command.amount, method: command.method, reference: command.reference, creditNoteRef: command.creditNoteRef, recordedBy: ctx.userId, at: now };
      recordPayment(i, p); o = { entity: 'invoice', id: i.id, summary: `${i.number}: ${command.method} settlement recorded (${i.status})` }; break;
    }
    case 'expense.create': {
      require('finance.expense.manage'); branch(command.branchId); department(command.departmentId, command.branchId); const p = project(command.projectId); if (command.vendorId) get(d.vendors, command.vendorId, 'Vendor');
      const id = crypto.randomUUID(); const { type: _type, ...input } = command; d.expenses.push({ ...input, id, tenantId: ctx.tenantId, incurredAt: now });
      if (p) { p.spent = projectSpend(d, p.id); if (p.spent > p.budget) notifyManagers('Project over budget', p.name, `/app/projects/${p.id}`); }
      o = { entity: 'expense', id, summary: 'Expense recorded', result: { id } }; break;
    }
    case 'budget.create': {
      require('finance.budget.manage'); department(command.departmentId); if (d.budgets.some(b => b.tenantId === ctx.tenantId && b.year === command.year && b.departmentId === command.departmentId)) conflict('A budget already exists for this year and cost centre');
      const id = crypto.randomUUID(); const { type: _type, ...input } = command; d.budgets.push({ ...input, id, tenantId: ctx.tenantId }); o = { entity: 'budget', id, summary: 'Budget created', result: { id } }; break;
    }
    case 'article.save': {
      require('docs.content.manage'); const existing = command.id ? get(d.articles, command.id, 'Article') : undefined; const id = existing?.id ?? crypto.randomUUID();
      const { type: _type, id: _id, publish, ...input } = command; const value = { ...input, status: publish ? 'published' as const : 'draft' as const, updatedAt: now };
      if (existing) Object.assign(existing, value); else d.articles.unshift({ ...value, id, tenantId: ctx.tenantId, authorId: ctx.userId, helpful: 0 });
      o = { entity: 'article', id, summary: `Article ${existing ? 'updated' : 'created'}`, result: { id } }; break;
    }
    case 'document.create': {
      require('docs.content.manage'); asset(command.assetId); const id = crypto.randomUUID(); const { type: _type, ...input } = command;
      d.documents.unshift({ ...input, id, tenantId: ctx.tenantId, version: '1.0', ownerId: ctx.userId, updatedAt: now, versions: [{ version: '1.0', summary: input.summary, at: now, by: ctx.userId }] });
      o = { entity: 'document', id, summary: 'Document registered', result: { id } }; break;
    }
    case 'document.version': {
      require('docs.content.manage'); const doc = get(d.documents, command.id, 'Document'); const version = `1.${doc.versions?.length ?? 1}`;
      doc.versions = [...(doc.versions ?? []), { version, summary: command.summary, at: now, by: ctx.userId }]; doc.version = version; doc.summary = command.summary; doc.updatedAt = now; if (command.expiresAt) doc.expiresAt = command.expiresAt;
      o = { entity: 'document', id: doc.id, summary: `Document revised to ${version}` }; break;
    }
    case 'assessment.create': {
      require('compliance.item.manage'); const id = crypto.randomUUID();
      d.assessments.unshift({ id, tenantId: ctx.tenantId, name: command.name, framework: command.framework, status: 'in_progress', score: 0, conductedBy: ctx.userId, startedAt: now, controls: command.controls.map(c => ({ id: crypto.randomUUID(), title: c.title, response: 'no', evidence: '' })) });
      o = { entity: 'assessment', id, summary: 'Self-assessment created', result: { id } }; break;
    }
    case 'assessment.answer': {
      require('compliance.item.manage'); const a = get(d.assessments, command.id, 'Assessment'); if (a.status === 'completed') conflict('Assessment is completed');
      const c = a.controls?.find(c => c.id === command.controlId) ?? notFound('Control'); if (command.response !== 'no' && !command.evidence.trim()) fail('Evidence is required for satisfied or excluded controls');
      c.response = command.response; c.evidence = command.evidence; const applicable = a.controls!.filter(c => c.response !== 'na'); a.score = applicable.length ? Math.round(applicable.filter(c => c.response === 'yes').length / applicable.length * 100) : 0;
      o = { entity: 'assessment', id: a.id, summary: 'Control evidence recorded; score recalculated' }; break;
    }
    case 'assessment.complete': {
      require('compliance.item.manage'); const a = get(d.assessments, command.id, 'Assessment'); if (a.status === 'completed') conflict('Assessment already completed');
      if (a.controls?.some(c => c.response !== 'no' && !c.evidence)) fail('Provide evidence for every satisfied or excluded control'); a.status = 'completed'; a.completedAt = now;
      o = { entity: 'assessment', id: a.id, summary: 'Self-assessment completed (not certification)' }; break;
    }
    case 'finding.create': {
      require('compliance.item.manage'); const a = get(d.assessments, command.assessmentId, 'Assessment'); const owner = command.ownerId ?? ctx.userId; member(d, ctx.tenantId, owner); const id = crypto.randomUUID();
      const { type: _type, ...input } = command; d.findings.push({ ...input, id, tenantId: ctx.tenantId, status: 'open', ownerId: owner }); notify(owner, 'Compliance finding assigned', a.name, '/app/compliance');
      o = { entity: 'finding', id, summary: 'Finding recorded', result: { id } }; break;
    }
    case 'finding.status': {
      require('compliance.item.manage'); const f = get(d.findings, command.id, 'Finding'); assertTransition(f.status, command.status, { open: ['in_progress'], in_progress: ['remediated'], remediated: [] });
      if (command.status === 'remediated' && !command.evidence?.trim()) fail('Remediation evidence is required'); f.status = command.status;
      o = { entity: 'finding', id: f.id, summary: `Finding → ${command.status}${command.evidence ? '; evidence supplied' : ''}` }; break;
    }
    case 'risk.save': {
      require('compliance.item.manage'); const existing = command.id ? get(d.risks, command.id, 'Risk') : undefined; const id = existing?.id ?? crypto.randomUUID();
      const { type: _type, id: _id, ...input } = command;
      if (existing) { if (existing.status === 'closed') conflict('Closed risks cannot be edited'); Object.assign(existing, input); }
      else d.risks.unshift({ ...input, id, tenantId: ctx.tenantId, ownerId: ctx.userId, status: 'open', createdAt: now });
      o = { entity: 'risk', id, summary: `Risk ${existing ? 'updated' : 'registered'}`, result: { id } }; break;
    }
    case 'risk.status': {
      require('compliance.item.manage'); const r = get(d.risks, command.id, 'Risk'); assertTransition(r.status, command.status, { open: ['mitigating', 'accepted'], mitigating: ['closed', 'accepted'], accepted: ['mitigating', 'closed'], closed: [] });
      if (['accepted', 'closed'].includes(command.status) && !command.justification?.trim()) fail('Risk acceptance/closure requires a justification');
      if (command.status === 'accepted' && !['org_owner', 'org_admin', 'svc_delivery_manager'].includes(ctx.role)) fail('A workspace owner or administrator must accept risk');
      r.status = command.status; o = { entity: 'risk', id: r.id, summary: `Risk → ${command.status}; justification recorded in request audit` }; break;
    }
    case 'notification.read': {
      const items = d.notifications.filter(n => n.tenantId === ctx.tenantId && n.userId === ctx.userId && (!command.id || n.id === command.id));
      if (command.id && !items.length) notFound('Notification'); if (!items.some(n => !n.read)) conflict('Notifications already read'); items.forEach(n => { n.read = true; });
      o = { entity: 'notification', id: command.id ?? ctx.userId, summary: 'Own notifications marked read' }; break;
    }
    case 'report.run': {
      require('reports.report.view'); branch(command.params.branchId); if (Date.parse(command.params.from) > Date.parse(command.params.to)) fail('Report start must precede end');
      if (command.reportId === 'finance') require('finance.invoice.view'); if (command.reportId === 'assets') require('assets.asset.view');
      const id = crypto.randomUUID(); d.reportRuns.unshift({ id, tenantId: ctx.tenantId, reportId: command.reportId, title: command.title, runBy: ctx.userId, at: now, params: Object.fromEntries(Object.entries(command.params).filter((entry): entry is [string, string] => entry[1] !== undefined)) });
      o = { entity: 'report', id, summary: `Generated ${command.title}`, result: { id } }; break;
    }
    case 'report.schedule': {
      require('reports.report.export'); branch(command.branchId); if (Date.parse(command.nextRunAt) <= nowMs) fail('Next report run must be in the future');
      if (command.reportId === 'finance') require('finance.invoice.view'); if (command.reportId === 'assets') require('assets.asset.view');
      const id = crypto.randomUUID(); const { type: _type, ...input } = command; d.reportSchedules.push({ ...input, id, tenantId: ctx.tenantId, active: true, createdBy: ctx.userId });
      o = { entity: 'reportSchedule', id, summary: 'Report schedule created', result: { id } }; break;
    }
    case 'report.schedule.pause': {
      require('reports.report.export'); const s = get(d.reportSchedules, command.id, 'Report schedule'); s.active = command.active; o = { entity: 'reportSchedule', id: s.id, summary: `Report schedule ${command.active ? 'resumed' : 'paused'}` }; break;
    }
    case 'privacy.request': {
      if (d.privacyRequests.some(r => r.tenantId === ctx.tenantId && r.userId === ctx.userId && r.status === 'pending')) conflict('You already have a pending privacy request'); const id = crypto.randomUUID();
      d.privacyRequests.push({ id, tenantId: ctx.tenantId, userId: ctx.userId, kind: command.kind, reason: command.reason, status: 'pending', createdAt: now }); notifyManagers('Privacy request needs review', command.kind, '/app/admin');
      o = { entity: 'privacyRequest', id, summary: `Personal data ${command.kind} requested`, result: { id } }; break;
    }
    case 'privacy.resolve': {
      require('admin.org'); const r = get(d.privacyRequests, command.id, 'Privacy request'); if (r.status !== 'pending') conflict('Request already resolved');
      if (r.userId === ctx.userId) fail('A different administrator must review this request');
      if (r.kind === 'erasure' && command.status === 'completed') {
        const m = d.memberships.find(m => m.tenantId === ctx.tenantId && m.userId === r.userId); if (m?.role === 'org_owner') fail('Transfer workspace ownership before erasure');
        if (m) m.status = 'suspended'; const u = d.users.find(u => u.id === r.userId); if (u) { u.name = 'Erased user'; u.email = `erased-${u.id}@invalid.example`; u.phone = ''; u.status = 'deactivated'; }
        for (const t of d.tickets) if (t.tenantId === ctx.tenantId && t.assigneeId === r.userId && !['closed', 'resolved'].includes(t.status)) { t.assigneeId = undefined; if (t.status === 'assigned') t.status = 'triaged'; }
      }
      r.status = command.status; r.resolvedAt = now; o = { entity: 'privacyRequest', id: r.id, summary: `Privacy request ${command.status}: ${command.reason}` }; break;
    }
  }
  d.auditLogs.unshift({ id: crypto.randomUUID(), tenantId: ctx.tenantId, actorId: ctx.userId, actorName: userName(ctx.userId), action: command.type, entity: o.entity, entityId: o.id, summary: o.summary, at: now, diff: Object.entries(command).filter(([k]) => ['status', 'role', 'justification', 'evidence', 'reason', 'permissions', 'expiresAt'].includes(k)).map(([field, to]) => ({ field, from: null, to })) });
  return { data: d, result: o.result ?? { id: o.id } };
}

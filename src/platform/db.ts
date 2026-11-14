/**
 * Data layer — the ONLY path through which modules read or write business data.
 * Write operations enforce permissions (the "server boundary" of this build) and
 * emit audit-log entries and notifications, matching the production API contract.
 */
import type {
  AccessContext,
} from './permissions';
import { can } from './permissions';
import type {
  Asset, AuditLog, DocumentRecord, Finding, Invoice, InvoiceItem, Project, PurchaseOrder,
  Risk, ServiceAgreement, TaskItem, Ticket, TicketStatus, User, WorkOrder,
} from './types';
import type { Permission } from './permissions';
import { addBusinessMinutes, DEFAULT_SLA_TARGETS, priorityFrom } from './sla';
import { getData, mutate } from './store';
import { nowIso, uid } from './util';

export class PermissionDenied extends Error {
  constructor(perm: Permission) { super(`Missing permission: ${perm}`); this.name = 'PermissionDenied'; }
}

export function require(ctx: AccessContext, perm: Permission): void {
  if (!can(ctx, perm)) throw new PermissionDenied(perm);
}

// ── Audit & notifications ────────────────────────────────────────────────────

function writeAudit(
  draft: { auditLogs: AuditLog[] },
  ctx: AccessContext,
  actorName: string,
  action: string,
  entity: string,
  entityId: string,
  summary: string,
  diff?: { field: string; from: unknown; to: unknown }[],
): void {
  draft.auditLogs.unshift({
    id: uid(), tenantId: ctx.tenantId, actorId: ctx.userId, actorName,
    action, entity, entityId, summary, diff, at: nowIso(),
  });
  if (draft.auditLogs.length > 4000) draft.auditLogs.length = 4000;
}

function pushNotification(userId: string | undefined, tenantId: string, title: string, body: string, link?: string): void {
  if (!userId) return;
  mutate(d => {
    d.notifications.unshift({ id: uid(), tenantId, userId, title, body, link, read: false, at: nowIso() });
    if (d.notifications.length > 800) d.notifications.length = 800;
  });
}

function nextNumber(draft: { counters: Record<string, number> }, tenantId: string, kind: string, prefix: string): string {
  const key = `${tenantId}:${kind}`;
  const n = (draft.counters[key] ?? 1000) + 1;
  draft.counters[key] = n;
  return `${prefix}-${n}`;
}

const userName = (userId: string): string => getData().users.find(u => u.id === userId)?.name ?? 'System';

// ── Tenancy & organisation ───────────────────────────────────────────────────

export interface RegisterOrgInput {
  orgName: string; industry: string; city: string; plan: 'starter' | 'professional' | 'business';
  type: 'organisation' | 'service_provider';
  ownerName: string; ownerEmail: string; ownerPhone: string;
  branches: { name: string; city: string }[];
  departments: string[];
}

/** Self-service registration: no prior session exists, so this is the one unauthenticated write. */
export function registerOrganisation(input: RegisterOrgInput): { tenantId: string; userId: string } {
  const tenantId = uid();
  const userId = uid();
  const now = nowIso();
  mutate(d => {
    const slug = input.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
    d.tenants.push({
      id: tenantId, name: input.orgName, slug: `${slug}-${tenantId.slice(0, 4)}`, type: input.type,
      industry: input.industry, plan: input.type === 'service_provider' ? 'msp_launch' : input.plan,
      status: 'active', city: input.city, createdAt: now, aiAssistCredits: 500,
    });
    d.users.push({ id: userId, name: input.ownerName, email: input.ownerEmail, phone: input.ownerPhone, title: 'Organisation Owner', status: 'active', createdAt: now });
    d.memberships.push({ userId, tenantId, role: 'org_owner', status: 'active' });
    const branchIds = input.branches.map(b => {
      const id = uid();
      d.branches.push({ id, tenantId, name: b.name, city: b.city, address: `${b.city}`, status: 'active' });
      return id;
    });
    const mainBranch = branchIds[0];
    for (const depName of input.departments) {
      d.departments.push({ id: uid(), tenantId, branchId: mainBranch, name: depName });
    }
    d.slaPolicies.push({
      id: uid(), tenantId, name: 'Standard business-hours SLA', targets: DEFAULT_SLA_TARGETS,
      workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [],
    });
    d.auditLogs.unshift({
      id: uid(), tenantId, actorId: userId, actorName: input.ownerName, action: 'org.registered',
      entity: 'tenant', entityId: tenantId, summary: `Registered organisation "${input.orgName}"`, at: now,
    });
    d.notifications.unshift({ id: uid(), tenantId, userId, title: 'Welcome to TechPros One', body: 'Your workspace is ready. Invite your team from Settings → Users.', read: false, at: now, link: '/app/settings/users' });
  });
  return { tenantId, userId };
}

export function updateTenantProfile(ctx: AccessContext, patch: Partial<Pick<import('./types').Tenant, 'name' | 'city' | 'industry'>>): void {
  require(ctx, 'admin.org');
  mutate(d => {
    const t = d.tenants.find(x => x.id === ctx.tenantId);
    if (!t) return;
    Object.assign(t, patch);
    writeAudit(d, ctx, userName(ctx.userId), 'org.updated', 'tenant', t.id, `Updated organisation profile`);
  });
}

export function createBranch(ctx: AccessContext, name: string, city: string): void {
  require(ctx, 'admin.org');
  mutate(d => {
    const id = uid();
    d.branches.push({ id, tenantId: ctx.tenantId, name, city, address: city, status: 'active' });
    writeAudit(d, ctx, userName(ctx.userId), 'branch.created', 'branch', id, `Created branch "${name}"`);
  });
}

export function createDepartment(ctx: AccessContext, name: string, branchId: string): void {
  require(ctx, 'admin.org');
  mutate(d => {
    const id = uid();
    d.departments.push({ id, tenantId: ctx.tenantId, name, branchId });
    writeAudit(d, ctx, userName(ctx.userId), 'department.created', 'department', id, `Created department "${name}"`);
  });
}

export function inviteUser(ctx: AccessContext, name: string, email: string, role: import('./types').RoleId): void {
  require(ctx, 'admin.users');
  mutate(d => {
    const id = uid();
    d.invitations.push({ id, tenantId: ctx.tenantId, name, email, role, status: 'pending', createdAt: nowIso() });
    writeAudit(d, ctx, userName(ctx.userId), 'user.invited', 'invitation', id, `Invited ${name} (${email}) as ${role}`);
  });
}

export function acceptInvitation(ctx: AccessContext, invitationId: string): string | undefined {
  require(ctx, 'admin.users');
  let newUserId: string | undefined;
  mutate(d => {
    const inv = d.invitations.find(i => i.id === invitationId && i.tenantId === ctx.tenantId && i.status === 'pending');
    if (!inv) return;
    inv.status = 'accepted';
    const u: User = { id: uid(), name: inv.name, email: inv.email, phone: '', title: '', status: 'active', createdAt: nowIso() };
    d.users.push(u);
    d.memberships.push({ userId: u.id, tenantId: ctx.tenantId, role: inv.role, status: 'active' });
    writeAudit(d, ctx, userName(ctx.userId), 'user.joined', 'user', u.id, `${inv.name} joined the workspace`);
    newUserId = u.id;
  });
  return newUserId;
}

export function changeMemberRole(ctx: AccessContext, userId: string, role: import('./types').RoleId): void {
  require(ctx, 'admin.users');
  mutate(d => {
    const m = d.memberships.find(x => x.userId === userId && x.tenantId === ctx.tenantId);
    if (!m) return;
    const from = m.role;
    m.role = role;
    writeAudit(d, ctx, userName(ctx.userId), 'user.role_changed', 'user', userId, `Changed ${userName(userId)}'s role to ${role}`, [{ field: 'role', from, to: role }]);
  });
}

export function setSubscriptionPlan(ctx: AccessContext, plan: import('./types').PlanId): void {
  require(ctx, 'admin.subscription');
  mutate(d => {
    const t = d.tenants.find(x => x.id === ctx.tenantId);
    if (!t) return;
    const from = t.plan;
    t.plan = plan;
    writeAudit(d, ctx, userName(ctx.userId), 'billing.plan_changed', 'tenant', t.id, `Subscription changed to ${plan}`, [{ field: 'plan', from, to: plan }]);
  });
}

// ── Service desk ─────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  kind: Ticket['kind']; title: string; description: string; category: string;
  impact: Ticket['impact']; urgency: Ticket['urgency'];
  branchId?: string; departmentId?: string; assetId?: string;
  requesterId?: string; source?: Ticket['source'];
}

export function createTicket(ctx: AccessContext, input: CreateTicketInput): string {
  require(ctx, 'itsm.ticket.create');
  const data = getData();
  const policy = data.slaPolicies.find(p => p.tenantId === ctx.tenantId);
  const priority = priorityFrom(input.impact, input.urgency);
  const targets = policy?.targets ?? DEFAULT_SLA_TARGETS;
  const cal = policy ?? { workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [] };
  const now = nowIso();
  const id = uid();
  mutate(d => {
    d.tickets.unshift({
      id, tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'ticket', 'TKT'),
      kind: input.kind, title: input.title, description: input.description, category: input.category,
      requesterId: input.requesterId ?? ctx.userId, branchId: input.branchId, departmentId: input.departmentId,
      assetId: input.assetId, impact: input.impact, urgency: input.urgency, priority,
      priorityOverridden: false, status: 'new', slaPolicyId: policy?.id,
      responseDueAt: addBusinessMinutes(now, targets[priority].response, cal),
      resolveDueAt: addBusinessMinutes(now, targets[priority].resolve, cal),
      source: input.source ?? 'portal', createdAt: now, updatedAt: now,
    });
    writeAudit(d, ctx, userName(ctx.userId), 'ticket.created', 'ticket', id, `Opened ${input.kind} "${input.title}" (priority ${priority})`);
  });
  return id;
}

export function assignTicket(ctx: AccessContext, ticketId: string, assigneeId: string): void {
  require(ctx, 'itsm.ticket.assign');
  mutate(d => {
    const t = d.tickets.find(x => x.id === ticketId && x.tenantId === ctx.tenantId);
    if (!t) return;
    const from = t.assigneeId;
    t.assigneeId = assigneeId;
    t.status = t.status === 'new' || t.status === 'triaged' ? 'assigned' : t.status;
    t.updatedAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), 'ticket.assigned', 'ticket', t.id, `Assigned ${t.number} to ${userName(assigneeId)}`, [{ field: 'assigneeId', from, to: assigneeId }]);
  });
  pushNotification(assigneeId, ctx.tenantId, 'Ticket assigned to you', `${ticketId} was assigned to you`, `/app/service-desk/${ticketId}`);
}

export function setTicketStatus(ctx: AccessContext, ticketId: string, status: TicketStatus, resolutionSummary?: string): void {
  const t0 = getData().tickets.find(x => x.id === ticketId && x.tenantId === ctx.tenantId);
  if (!t0) return;
  // Technicians update/close their own queue; employees only confirm their own resolved tickets.
  const own = t0.requesterId === ctx.userId || t0.assigneeId === ctx.userId;
  const allowed =
    (status === 'closed' && own && t0.status === 'resolved' && can(ctx, 'itsm.ticket.view.own')) ||
    can(ctx, 'itsm.ticket.update') ||
    (status === 'closed' && can(ctx, 'itsm.ticket.close'));
  if (!allowed) throw new PermissionDenied('itsm.ticket.update');
  mutate(d => {
    const t = d.tickets.find(x => x.id === ticketId && x.tenantId === ctx.tenantId);
    if (!t) return;
    const from = t.status;
    t.status = status;
    t.updatedAt = nowIso();
    if (status === 'in_progress' && !t.firstResponseAt) t.firstResponseAt = nowIso();
    if (status === 'resolved') { t.resolvedAt = nowIso(); if (resolutionSummary) t.resolutionSummary = resolutionSummary; }
    if (status === 'closed') t.closedAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), 'ticket.status_changed', 'ticket', t.id, `${t.number}: ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
  pushNotification(t0.requesterId, ctx.tenantId, `Ticket ${t0.number} ${status.replace('_', ' ')}`, t0.title, `/app/service-desk/${ticketId}`);
}

export function addTicketMessage(ctx: AccessContext, ticketId: string, body: string, internal: boolean): void {
  const t0 = getData().tickets.find(x => x.id === ticketId && x.tenantId === ctx.tenantId);
  if (!t0) return;
  const involved = t0.requesterId === ctx.userId || t0.assigneeId === ctx.userId;
  if (!involved && !can(ctx, 'itsm.ticket.view.team') && !can(ctx, 'itsm.ticket.view.all')) throw new PermissionDenied('itsm.ticket.update');
  if (internal && !can(ctx, 'itsm.ticket.update')) throw new PermissionDenied('itsm.ticket.update');
  mutate(d => {
    d.ticketMessages.push({ id: uid(), tenantId: ctx.tenantId, ticketId, authorId: ctx.userId, body, internal, createdAt: nowIso() });
    const t = d.tickets.find(x => x.id === ticketId);
    if (t) t.updatedAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), internal ? 'ticket.note_added' : 'ticket.replied', 'ticket', ticketId, `${t0.number}: ${internal ? 'internal note' : 'reply'}`);
  });
}

export function rateTicket(ctx: AccessContext, ticketId: string, score: number): void {
  const t0 = getData().tickets.find(x => x.id === ticketId && x.tenantId === ctx.tenantId);
  if (!t0 || t0.requesterId !== ctx.userId) throw new PermissionDenied('itsm.ticket.view.own');
  mutate(d => {
    const t = d.tickets.find(x => x.id === ticketId);
    if (!t) return;
    t.csat = Math.max(1, Math.min(5, Math.round(score)));
    writeAudit(d, ctx, userName(ctx.userId), 'ticket.rated', 'ticket', t.id, `${t.number}: CSAT ${t.csat}/5`);
  });
}

// ── Assets ───────────────────────────────────────────────────────────────────

export interface CreateAssetInput {
  name: string; category: string; manufacturer: string; model: string; serial: string;
  branchId: string; departmentId?: string; assigneeId?: string;
  purchaseDate: string; purchaseCost: number; usefulLifeYears: number; warrantyExpiry?: string;
}

export function createAsset(ctx: AccessContext, input: CreateAssetInput): string {
  require(ctx, 'assets.asset.create');
  const id = uid();
  mutate(d => {
    const tag = nextNumber(d, ctx.tenantId, 'asset', 'TP');
    d.assets.push({
      id, tenantId: ctx.tenantId, tag, name: input.name, category: input.category,
      manufacturer: input.manufacturer, model: input.model, serial: input.serial,
      branchId: input.branchId, departmentId: input.departmentId, assigneeId: input.assigneeId,
      purchaseDate: input.purchaseDate, purchaseCost: input.purchaseCost,
      usefulLifeYears: Math.max(1, input.usefulLifeYears), warrantyExpiry: input.warrantyExpiry,
      lifecycle: 'in_service', condition: 'good', createdAt: nowIso(),
    });
    writeAudit(d, ctx, userName(ctx.userId), 'asset.created', 'asset', id, `Registered ${input.name} (${tag})`);
  });
  return id;
}

export function updateAsset(ctx: AccessContext, assetId: string, patch: Partial<Pick<Asset, 'name' | 'condition' | 'lifecycle' | 'notes' | 'branchId' | 'departmentId' | 'assigneeId' | 'warrantyExpiry'>>): void {
  require(ctx, 'assets.asset.update');
  mutate(d => {
    const a = d.assets.find(x => x.id === assetId && x.tenantId === ctx.tenantId);
    if (!a) return;
    const changes = Object.entries(patch).filter(([k, v]) => (a as unknown as Record<string, unknown>)[k] !== v).map(([field, v]) => ({ field, from: (a as unknown as Record<string, unknown>)[field], to: v }));
    if (!changes.length) return;
    Object.assign(a, patch);
    writeAudit(d, ctx, userName(ctx.userId), 'asset.updated', 'asset', a.id, `Updated ${a.tag} ${a.name}`, changes);
  });
}

export function depreciatedValue(asset: Pick<Asset, 'purchaseCost' | 'purchaseDate' | 'usefulLifeYears'>, at = new Date()): number {
  const ageYears = (at.getTime() - new Date(asset.purchaseDate).getTime()) / (365.25 * 86_400_000);
  const fraction = Math.min(1, Math.max(0, 1 - ageYears / Math.max(1, asset.usefulLifeYears)));
  return Math.round(asset.purchaseCost * fraction);
}

// ── Maintenance & work orders ────────────────────────────────────────────────

export function createWorkOrder(ctx: AccessContext, input: { title: string; kind: WorkOrder['kind']; assetId?: string; planId?: string; assigneeId?: string; dueAt: string; checklist: string[]; branchId?: string }): void {
  require(ctx, 'maintenance.workorder.manage');
  mutate(d => {
    d.workOrders.unshift({
      id: uid(), tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'workorder', 'WO'),
      title: input.title, kind: input.kind, planId: input.planId, assetId: input.assetId,
      branchId: input.branchId, assigneeId: input.assigneeId, status: 'open', dueAt: input.dueAt,
      checklist: input.checklist.map(item => ({ item, done: false })), createdAt: nowIso(),
    });
    writeAudit(d, ctx, userName(ctx.userId), 'workorder.created', 'workorder', input.assetId ?? '', `Created work order "${input.title}"`);
  });
  if (input.assigneeId) pushNotification(input.assigneeId, ctx.tenantId, 'New work order', input.title, '/app/maintenance');
}

export function updateWorkOrderStatus(ctx: AccessContext, id: string, status: WorkOrder['status'], patch?: Partial<Pick<WorkOrder, 'labourHours' | 'cost' | 'notes' | 'assigneeId' | 'dueAt'>>): void {
  require(ctx, 'maintenance.workorder.manage');
  mutate(d => {
    const w = d.workOrders.find(x => x.id === id && x.tenantId === ctx.tenantId);
    if (!w) return;
    const from = w.status;
    w.status = status;
    if (patch) Object.assign(w, patch);
    if (status === 'completed') w.completedAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), 'workorder.status_changed', 'workorder', w.id, `${w.number} ${w.title}: ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

export function toggleChecklistItem(ctx: AccessContext, workOrderId: string, index: number): void {
  require(ctx, 'maintenance.workorder.manage');
  mutate(d => {
    const w = d.workOrders.find(x => x.id === workOrderId && x.tenantId === ctx.tenantId);
    const item = w?.checklist[index];
    if (!w || !item) return;
    item.done = !item.done;
    writeAudit(d, ctx, userName(ctx.userId), 'workorder.checklist', 'workorder', w.id, `${w.number}: "${item.item}" ${item.done ? 'done' : 'reopened'}`);
  });
}

export function createMaintenancePlan(ctx: AccessContext, input: { name: string; assetCategory: string; intervalMonths: number; checklist: string[]; assigneeId: string; nextRunAt: string }): void {
  require(ctx, 'maintenance.plan.manage');
  mutate(d => {
    d.maintenancePlans.push({ id: uid(), tenantId: ctx.tenantId, active: true, ...input, checklist: input.checklist });
    writeAudit(d, ctx, userName(ctx.userId), 'maintenance.plan_created', 'maintenancePlan', input.name, `Created maintenance plan "${input.name}"`);
  });
}

/** Generate the next work orders for due plans (scheduled-job simulation). */
export function runMaintenanceScheduler(ctx: AccessContext): number {
  require(ctx, 'maintenance.plan.manage');
  let created = 0;
  const now = new Date();
  const data = getData();
  const duePlans = data.maintenancePlans.filter(p => p.tenantId === ctx.tenantId && p.active && new Date(p.nextRunAt) <= now);
  for (const plan of duePlans) {
    const assets = data.assets.filter(a => a.tenantId === ctx.tenantId && a.category === plan.assetCategory && a.lifecycle === 'in_service');
    if (!assets.length) continue;
    mutate(d => {
      const p = d.maintenancePlans.find(x => x.id === plan.id)!;
      const next = new Date(p.nextRunAt);
      next.setMonth(next.getMonth() + p.intervalMonths);
      p.nextRunAt = next.toISOString();
      for (const a of assets) {
        d.workOrders.push({
          id: uid(), tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'workorder', 'WO'),
          title: `${plan.name} — ${a.name}`, kind: 'preventive', planId: plan.id, assetId: a.id,
          branchId: a.branchId, assigneeId: plan.assigneeId, status: 'scheduled',
          dueAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
          checklist: plan.checklist.map(item => ({ item, done: false })), createdAt: nowIso(),
        });
      }
      writeAudit(d, ctx, userName(ctx.userId), 'maintenance.scheduled', 'maintenancePlan', plan.id, `Scheduler generated ${assets.length} work orders for "${plan.name}"`);
    });
    created += assets.length;
  }
  return created;
}

// ── Infrastructure & alerts ──────────────────────────────────────────────────

export function acknowledgeAlert(ctx: AccessContext, alertId: string): void {
  require(ctx, 'infrastructure.alert.manage');
  mutate(d => {
    const a = d.alerts.find(x => x.id === alertId && x.tenantId === ctx.tenantId);
    if (!a || a.status !== 'active') return;
    a.status = 'acknowledged'; a.ackAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), 'alert.acknowledged', 'alert', a.id, `Acknowledged: ${a.message}`);
  });
}

export function resolveAlert(ctx: AccessContext, alertId: string): void {
  require(ctx, 'infrastructure.alert.manage');
  mutate(d => {
    const a = d.alerts.find(x => x.id === alertId && x.tenantId === ctx.tenantId);
    if (!a) return;
    a.status = 'resolved'; a.resolvedAt = nowIso();
    const dev = d.devices.find(x => x.id === a.deviceId);
    if (dev && a.severity === 'critical') { dev.status = 'up'; dev.lastSeenAt = nowIso(); dev.latencyMs = Math.max(4, Math.round(dev.latencyMs / 3)); dev.packetLossPct = 0; }
    writeAudit(d, ctx, userName(ctx.userId), 'alert.resolved', 'alert', a.id, `Resolved: ${a.message}`);
  });
}

/**
 * Workflow automation (README Module 14): a monitored device going offline
 * creates ONE alert + ONE linked incident, with dedup against an active alert.
 */
export function simulateDeviceOutage(ctx: AccessContext, deviceId: string): { alertId?: string; incidentId?: string; deduped: boolean } {
  require(ctx, 'infrastructure.device.manage');
  const data = getData();
  const device = data.devices.find(x => x.id === deviceId && x.tenantId === ctx.tenantId);
  if (!device) return { deduped: false };
  const existing = data.alerts.find(a => a.deviceId === deviceId && a.status !== 'resolved');
  if (existing) return { deduped: true };
  let alertId = '';
  let incidentId = '';
  const now = nowIso();
  mutate(d => {
    const dev = d.devices.find(x => x.id === deviceId)!;
    dev.status = 'down'; dev.packetLossPct = 100; dev.lastSeenAt = now;
    alertId = uid();
    d.alerts.unshift({
      id: alertId, tenantId: ctx.tenantId, deviceId, severity: 'critical',
      message: `${dev.name} is unreachable (packet loss 100%)`, status: 'active', createdAt: now,
    });
    const policy = d.slaPolicies.find(p => p.tenantId === ctx.tenantId);
    const cal = policy ?? { workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [] };
    incidentId = uid();
    d.tickets.unshift({
      id: incidentId, tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'ticket', 'TKT'),
      kind: 'incident', title: `Infrastructure outage: ${dev.name}`,
      description: `Monitoring detected that ${dev.name} (${dev.ip}) stopped responding. Affected branch: ${d.branches.find(b => b.id === dev.branchId)?.name ?? 'unknown'}.`,
      category: 'Network & connectivity', requesterId: ctx.userId, branchId: dev.branchId,
      impact: 'high', urgency: 'high', priority: 'critical', priorityOverridden: false,
      status: 'new', slaPolicyId: policy?.id,
      responseDueAt: addBusinessMinutes(now, 15, cal), resolveDueAt: addBusinessMinutes(now, 240, cal),
      source: 'monitoring', createdAt: now, updatedAt: now,
    });
    const al = d.alerts.find(x => x.id === alertId)!;
    al.incidentId = incidentId;
    writeAudit(d, ctx, 'Automation', 'automation.device_down', 'device', deviceId, `Outage on ${dev.name}: alert + critical incident created`, undefined);
  });
  const ticketNumber = getData().tickets.find(t => t.id === incidentId)?.number ?? '';
  for (const m of data.memberships.filter(m => m.tenantId === ctx.tenantId && (m.role === 'it_manager' || m.role === 'network_engineer' || m.role === 'org_owner'))) {
    pushNotification(m.userId, ctx.tenantId, `Critical alert on ${device.name}`, ticketNumber ? `Incident ${ticketNumber} created automatically` : 'Incident created automatically', `/app/service-desk/${incidentId}`);
  }
  return { alertId, incidentId, deduped: false };
}

// ── Projects ─────────────────────────────────────────────────────────────────

export function createProject(ctx: AccessContext, input: { name: string; kind: string; managerId: string; budget: number; dueAt: string; description: string; clientTenantId?: string }): void {
  require(ctx, 'projects.project.manage');
  mutate(d => {
    d.projects.unshift({
      id: uid(), tenantId: ctx.tenantId, clientTenantId: input.clientTenantId, name: input.name, kind: input.kind,
      status: 'planning', managerId: input.managerId, budget: input.budget, spent: 0,
      startAt: nowIso(), dueAt: input.dueAt, description: input.description,
      milestones: [], createdAt: nowIso(),
    });
    writeAudit(d, ctx, userName(ctx.userId), 'project.created', 'project', input.name, `Created project "${input.name}"`);
  });
}

export function setProjectStatus(ctx: AccessContext, id: string, status: Project['status']): void {
  require(ctx, 'projects.project.manage');
  mutate(d => {
    const p = d.projects.find(x => x.id === id && x.tenantId === ctx.tenantId);
    if (!p) return;
    const from = p.status; p.status = status;
    writeAudit(d, ctx, userName(ctx.userId), 'project.status_changed', 'project', p.id, `"${p.name}": ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

export function addTask(ctx: AccessContext, projectId: string, title: string, column: TaskItem['column']): void {
  require(ctx, 'projects.project.manage');
  mutate(d => {
    d.tasks.push({ id: uid(), tenantId: ctx.tenantId, projectId, title, column, priority: 'medium', createdAt: nowIso() });
    writeAudit(d, ctx, userName(ctx.userId), 'task.created', 'task', projectId, `Added task "${title}"`);
  });
}

export function moveTask(ctx: AccessContext, taskId: string, column: TaskItem['column']): void {
  require(ctx, 'projects.project.manage');
  mutate(d => {
    const t = d.tasks.find(x => x.id === taskId && x.tenantId === ctx.tenantId);
    if (!t) return;
    const from = t.column; t.column = column;
    writeAudit(d, ctx, userName(ctx.userId), 'task.moved', 'task', t.id, `"${t.title}": ${from} → ${column}`, [{ field: 'column', from, to: column }]);
  });
}

export function toggleMilestone(ctx: AccessContext, projectId: string, milestoneId: string): void {
  require(ctx, 'projects.project.manage');
  mutate(d => {
    const p = d.projects.find(x => x.id === projectId && x.tenantId === ctx.tenantId);
    const m = p?.milestones.find(x => x.id === milestoneId);
    if (!p || !m) return;
    m.done = !m.done;
    writeAudit(d, ctx, userName(ctx.userId), 'project.milestone', 'project', p.id, `"${p.name}" milestone "${m.title}" ${m.done ? 'completed' : 'reopened'}`);
    if (m.done && (m.title.toLowerCase().includes('pay') || m.title.toLowerCase().includes('procure'))) p.spent = Math.min(p.budget, p.spent + Math.round(p.budget * 0.3));
  });
}

// ── Clients & agreements (provider) ──────────────────────────────────────────

export function onboardClient(ctx: AccessContext, input: { name: string; industry: string; city: string; contactName: string; contactEmail: string; tier: ServiceAgreement['tier']; monthlyFee: number }): string {
  require(ctx, 'clients.client.manage');
  const clientTenantId = uid();
  mutate(d => {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    d.tenants.push({
      id: clientTenantId, name: input.name, slug: `${slug}-${clientTenantId.slice(0, 4)}`, type: 'organisation',
      industry: input.industry, plan: 'professional', status: 'active', providerId: ctx.tenantId,
      city: input.city, createdAt: nowIso(), aiAssistCredits: 300,
    });
    const branchId = uid();
    d.branches.push({ id: branchId, tenantId: clientTenantId, name: `${input.city} HQ`, city: input.city, address: input.city, status: 'active' });
    d.slaPolicies.push({ id: uid(), tenantId: clientTenantId, name: 'Client SLA', targets: DEFAULT_SLA_TARGETS, workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [] });
    d.contacts.push({ id: uid(), tenantId: ctx.tenantId, clientTenantId, name: input.contactName, role: 'Primary contact', email: input.contactEmail, phone: '', primary: true });
    const startsAt = nowIso();
    const renewsAt = new Date(); renewsAt.setFullYear(renewsAt.getFullYear() + 1);
    d.agreements.push({ id: uid(), tenantId: ctx.tenantId, clientTenantId, name: `${input.tier} managed IT services`, tier: input.tier, monthlyFee: input.monthlyFee, startsAt, renewsAt: renewsAt.toISOString(), status: 'active' });
    writeAudit(d, ctx, userName(ctx.userId), 'client.onboarded', 'tenant', clientTenantId, `Onboarded client "${input.name}" (${input.tier}, ₦${input.monthlyFee.toLocaleString('en-NG')}/mo)`);
  });
  return clientTenantId;
}

// ── Procurement & finance ────────────────────────────────────────────────────

export function createVendor(ctx: AccessContext, input: { name: string; category: string; contact: string; phone: string; email: string }): void {
  require(ctx, 'procurement.vendor.manage');
  mutate(d => {
    d.vendors.push({ id: uid(), tenantId: ctx.tenantId, rating: 4, status: 'active', ...input });
    writeAudit(d, ctx, userName(ctx.userId), 'vendor.created', 'vendor', input.name, `Added vendor "${input.name}"`);
  });
}

export function createPurchaseOrder(ctx: AccessContext, input: { vendorId: string; items: { name: string; qty: number; unitCost: number }[]; branchId?: string; note?: string }): void {
  require(ctx, 'procurement.po.create');
  mutate(d => {
    d.purchaseOrders.unshift({
      id: uid(), tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'po', 'PO'),
      vendorId: input.vendorId, status: 'requested', items: input.items, requestedBy: ctx.userId,
      branchId: input.branchId, note: input.note, createdAt: nowIso(),
    });
    writeAudit(d, ctx, userName(ctx.userId), 'po.requested', 'purchaseOrder', input.vendorId, `Purchase request submitted (${input.items.length} line items)`);
  });
}

export function setPoStatus(ctx: AccessContext, id: string, status: PurchaseOrder['status']): void {
  // Approvers move POs forward; requesters can cancel their own while unapproved.
  const po0 = getData().purchaseOrders.find(x => x.id === id && x.tenantId === ctx.tenantId);
  if (!po0) return;
  const ownCancel = status === 'cancelled' && po0.requestedBy === ctx.userId && po0.status === 'requested' && can(ctx, 'procurement.po.create');
  if (!ownCancel) require(ctx, 'procurement.po.approve');
  mutate(d => {
    const po = d.purchaseOrders.find(x => x.id === id)!;
    const from = po.status;
    po.status = status;
    if (status === 'approved') po.approvedBy = ctx.userId;
    if (status === 'received') {
      po.receivedAt = nowIso();
      // Received capital items become assets; consumables flow into stock.
      for (const item of po.items) {
        const capital = /laptop|desktop|server|printer|router|switch|firewall|access point|ups|projector|monitor/i.test(item.name);
        if (capital) {
          for (let i = 0; i < item.qty; i++) {
            d.assets.push({
              id: uid(), tenantId: ctx.tenantId, tag: nextNumber(d, ctx.tenantId, 'asset', 'TP'),
              name: item.name, category: 'End-user computing', manufacturer: '', model: '', serial: '',
              branchId: po.branchId ?? d.branches.find(b => b.tenantId === ctx.tenantId)?.id ?? '',
              purchaseDate: nowIso().slice(0, 10), purchaseCost: item.unitCost, usefulLifeYears: 4,
              lifecycle: 'in_storage', condition: 'excellent', createdAt: nowIso(),
            });
          }
        } else {
          const stock = d.stockItems.find(s => s.tenantId === ctx.tenantId && s.name.toLowerCase() === item.name.toLowerCase());
          if (stock) stock.qty += item.qty;
          else d.stockItems.push({ id: uid(), tenantId: ctx.tenantId, name: item.name, sku: `SKU-${d.stockItems.length + 1}`, category: 'Consumables', qty: item.qty, reorderLevel: Math.max(2, Math.ceil(item.qty * 0.25)), unitCost: item.unitCost, branchId: po.branchId ?? '' });
        }
      }
    }
    writeAudit(d, ctx, userName(ctx.userId), 'po.status_changed', 'purchaseOrder', po.id, `${po.number}: ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

export interface InvoiceTotals { subtotal: number; vat: number; wht: number; total: number; net: number; }
export function invoiceTotals(items: InvoiceItem[], vatRate: number, whtRate: number): InvoiceTotals {
  const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const vat = Math.round(subtotal * vatRate);
  const wht = Math.round(subtotal * whtRate);
  const total = subtotal + vat;
  const net = total - wht; // WHT is deducted by the client at payment
  return { subtotal, vat, wht, total, net };
}

export function createInvoice(ctx: AccessContext, input: { clientName: string; clientTenantId?: string; items: InvoiceItem[]; whtRate: number; dueDays: number }): void {
  require(ctx, 'finance.invoice.manage');
  const now = new Date();
  mutate(d => {
    d.invoices.unshift({
      id: uid(), tenantId: ctx.tenantId, number: nextNumber(d, ctx.tenantId, 'invoice', 'INV'),
      clientName: input.clientName, clientTenantId: input.clientTenantId, status: 'sent',
      items: input.items, vatRate: 0.075, whtRate: input.whtRate,
      issuedAt: now.toISOString(), dueAt: new Date(now.getTime() + input.dueDays * 86_400_000).toISOString(),
      createdBy: ctx.userId,
    });
    writeAudit(d, ctx, userName(ctx.userId), 'invoice.issued', 'invoice', input.clientName, `Issued invoice to ${input.clientName}`);
  });
}

export function setInvoiceStatus(ctx: AccessContext, id: string, status: Invoice['status']): void {
  require(ctx, 'finance.invoice.manage');
  mutate(d => {
    const inv = d.invoices.find(x => x.id === id && x.tenantId === ctx.tenantId);
    if (!inv) return;
    const from = inv.status; inv.status = status;
    if (status === 'paid') inv.paidAt = nowIso();
    writeAudit(d, ctx, userName(ctx.userId), 'invoice.status_changed', 'invoice', inv.id, `${inv.number}: ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

export function createExpense(ctx: AccessContext, input: { title: string; category: string; amount: number; branchId?: string; departmentId?: string; projectId?: string }): void {
  require(ctx, 'finance.expense.manage');
  mutate(d => {
    d.expenses.push({ id: uid(), tenantId: ctx.tenantId, incurredAt: nowIso(), ...input });
    writeAudit(d, ctx, userName(ctx.userId), 'expense.recorded', 'expense', input.title, `Recorded expense "${input.title}" — ₦${input.amount.toLocaleString('en-NG')}`);
  });
}

// ── Docs, compliance ─────────────────────────────────────────────────────────

export function saveArticle(ctx: AccessContext, input: { id?: string; title: string; body: string; category: string; tags: string[]; publish: boolean }): void {
  require(ctx, 'docs.content.manage');
  mutate(d => {
    if (input.id) {
      const a = d.articles.find(x => x.id === input.id && x.tenantId === ctx.tenantId);
      if (a) Object.assign(a, { title: input.title, body: input.body, category: input.category, tags: input.tags, status: input.publish ? 'published' : 'draft', updatedAt: nowIso() });
      writeAudit(d, ctx, userName(ctx.userId), 'docs.article_updated', 'article', input.id, `Updated article "${input.title}"`);
    } else {
      d.articles.unshift({ id: uid(), tenantId: ctx.tenantId, title: input.title, body: input.body, category: input.category, tags: input.tags, status: input.publish ? 'published' : 'draft', authorId: ctx.userId, helpful: 0, updatedAt: nowIso() });
      writeAudit(d, ctx, userName(ctx.userId), 'docs.article_created', 'article', input.title, `Created article "${input.title}"`);
    }
  });
}

export function saveDocumentRecord(ctx: AccessContext, input: { title: string; kind: DocumentRecord['kind']; summary: string; expiresAt?: string; assetId?: string }): void {
  require(ctx, 'docs.content.manage');
  mutate(d => {
    d.documents.unshift({ id: uid(), tenantId: ctx.tenantId, title: input.title, kind: input.kind, version: '1.0', ownerId: ctx.userId, summary: input.summary, expiresAt: input.expiresAt, assetId: input.assetId, updatedAt: nowIso() });
    writeAudit(d, ctx, userName(ctx.userId), 'docs.registered', 'document', input.title, `Registered document "${input.title}" v1.0`);
  });
}

export function addFinding(ctx: AccessContext, input: { assessmentId: string; title: string; severity: Finding['severity']; detail: string }): void {
  require(ctx, 'compliance.item.manage');
  mutate(d => {
    d.findings.push({ id: uid(), tenantId: ctx.tenantId, assessmentId: input.assessmentId, title: input.title, severity: input.severity, status: 'open', ownerId: ctx.userId, detail: input.detail });
    writeAudit(d, ctx, userName(ctx.userId), 'compliance.finding_added', 'finding', input.assessmentId, `Finding: ${input.title} (${input.severity})`);
  });
}

export function setFindingStatus(ctx: AccessContext, id: string, status: Finding['status']): void {
  require(ctx, 'compliance.item.manage');
  mutate(d => {
    const f = d.findings.find(x => x.id === id && x.tenantId === ctx.tenantId);
    if (!f) return;
    const from = f.status; f.status = status;
    writeAudit(d, ctx, userName(ctx.userId), 'compliance.finding_status', 'finding', f.id, `"${f.title}": ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

export function upsertRisk(ctx: AccessContext, input: { id?: string; title: string; category: string; likelihood: Risk['likelihood']; impact: Risk['impact']; treatment: string; dueAt?: string }): void {
  require(ctx, 'compliance.item.manage');
  mutate(d => {
    if (input.id) {
      const r = d.risks.find(x => x.id === input.id && x.tenantId === ctx.tenantId);
      if (r) Object.assign(r, input);
      writeAudit(d, ctx, userName(ctx.userId), 'compliance.risk_updated', 'risk', input.id, `Updated risk "${input.title}"`);
    } else {
      d.risks.unshift({ id: uid(), tenantId: ctx.tenantId, title: input.title, category: input.category, likelihood: input.likelihood, impact: input.impact, ownerId: ctx.userId, status: 'open', treatment: input.treatment, dueAt: input.dueAt, createdAt: nowIso() });
      writeAudit(d, ctx, userName(ctx.userId), 'compliance.risk_added', 'risk', input.title, `Added risk "${input.title}" (L${input.likelihood}×I${input.impact})`);
    }
  });
}

export function setRiskStatus(ctx: AccessContext, id: string, status: Risk['status']): void {
  require(ctx, 'compliance.item.manage');
  mutate(d => {
    const r = d.risks.find(x => x.id === id && x.tenantId === ctx.tenantId);
    if (!r) return;
    const from = r.status; r.status = status;
    writeAudit(d, ctx, userName(ctx.userId), 'compliance.risk_status', 'risk', r.id, `"${r.title}": ${from} → ${status}`, [{ field: 'status', from, to: status }]);
  });
}

// ── Notifications ────────────────────────────────────────────────────────────

export function markNotificationRead(tenantId: string, userId: string, id?: string): void {
  mutate(d => {
    for (const n of d.notifications) {
      if (n.tenantId === tenantId && n.userId === userId && (!id || n.id === id)) n.read = true;
    }
  });
}

export function recordReportRun(ctx: AccessContext, reportId: string, title: string, params: Record<string, string>): void {
  require(ctx, 'reports.report.view');
  mutate(d => {
    d.reportRuns.unshift({ id: uid(), tenantId: ctx.tenantId, reportId, title, runBy: ctx.userId, at: nowIso(), params });
    writeAudit(d, ctx, userName(ctx.userId), 'report.generated', 'report', reportId, `Generated "${title}"`);
  });
}

// ── Selectors used across modules ────────────────────────────────────────────

export function tenantUsers(data: { users: User[]; memberships: import('./types').Membership[] }, tenantId: string): User[] {
  const ids = new Set(data.memberships.filter(m => m.tenantId === tenantId && m.status === 'active').map(m => m.userId));
  return data.users.filter(u => ids.has(u.id));
}
export const userById = (data: { users: User[] }, id?: string): User | undefined => data.users.find(u => u.id === id);

export function accessibleTenantIds(data: { memberships: import('./types').Membership[]; tenants: import('./types').Tenant[] }, userId: string): string[] {
  const own = data.memberships.filter(m => m.userId === userId && m.status === 'active').map(m => m.tenantId);
  const providerTenants = own.filter(t => data.tenants.find(x => x.id === t)?.type === 'service_provider');
  const clients = data.tenants.filter(t => t.providerId && providerTenants.includes(t.providerId)).map(t => t.id);
  return [...new Set([...own, ...clients])];
}

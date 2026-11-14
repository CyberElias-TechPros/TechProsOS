/** Compatibility facade for the explicitly local demo and domain tests.
 * Live UI uses useAction -> authenticated /api/commands, never this facade.
 * Both adapters execute the SAME validated, audited domain reducer.
 */
import type { AccessContext } from './permissions';
import { accessContextFor, can } from './permissions';
import type { Asset, DataSet, DocumentRecord, Finding, Invoice, Project, PurchaseOrder, Risk, RoleId, TaskItem, TicketStatus, User, WorkOrder, PlanId, Tenant } from './types';
import { applyCommand, DomainError, PermissionDenied, provisionWorkspace, type Command, type CommandResult } from './operations';
type CreateTicketInput = Extract<Command, { type: 'ticket.create' }>;
import { getData, mutate, useData } from './store';
import { nowIso, uid } from './util';
export { PermissionDenied, DomainError } from './operations';
export { invoiceTotals, type MoneyLine } from './money';
export type { InvoiceTotals } from './money';
export type { RegisterInput, Command } from './contracts';
import type { RegisterInput } from './contracts';

export function dispatch(ctx: AccessContext, command: Command): CommandResult {
  if (useData.getState().mode !== 'demo') throw new DomainError('Use the authenticated API for live mutations', 'LIVE_API_REQUIRED', 400);
  let result: CommandResult = {};
  mutate(d => { result = applyCommand(d, ctx, command, { demo: true }).result; });
  return result;
}
export function require(ctx: AccessContext, permission: import('./permissions').Permission): void {
  if (!can(ctx, permission)) throw new PermissionDenied(permission);
  if (!ctx.delegated && !getData().memberships.some(m => m.userId === ctx.userId && m.tenantId === ctx.tenantId && m.status === 'active')) throw new DomainError('Active membership required', 'FORBIDDEN', 403);
}

/** Registration in this facade creates a fictional local identity only. */
export function registerOrganisation(input: Omit<RegisterInput, 'password' | 'consent'>): { tenantId: string; userId: string } {
  const tenantId = uid(), userId = uid(); const now = nowIso();
  const branchIds = input.branches.map(() => uid()), departmentIds = input.departments.map(() => uid());
  mutate(d => {
    d.users.push({ id: userId, name: input.ownerName, email: input.ownerEmail, phone: input.ownerPhone, title: 'Organisation Owner', status: 'active', createdAt: now });
    provisionWorkspace(d, { ...input, password: 'fictional-demo-only', consent: true }, { tenantId, userId, branchIds, departmentIds, policyId: uid() }, now);
  });
  return { tenantId, userId };
}
export function updateTenantProfile(ctx: AccessContext, patch: Partial<Pick<Tenant, 'name' | 'city' | 'industry'>>): void { dispatch(ctx, { type: 'tenant.update', ...patch }); }
export function createBranch(ctx: AccessContext, name: string, city: string): void { dispatch(ctx, { type: 'branch.create', name, city }); }
export function createDepartment(ctx: AccessContext, name: string, branchId: string): void { dispatch(ctx, { type: 'department.create', name, branchId }); }
export function inviteUser(ctx: AccessContext, name: string, email: string, role: RoleId): void { dispatch(ctx, { type: 'user.invite', name, email, role }); }
export function changeMemberRole(ctx: AccessContext, userId: string, role: RoleId): void { dispatch(ctx, { type: 'user.role', userId, role }); }
/** Demo-only plan preview. Live entitlements change exclusively after verified billing. */
export function setSubscriptionPlan(ctx: AccessContext, plan: PlanId): void {
  if (useData.getState().mode !== 'demo' || ctx.role !== 'org_owner') throw new PermissionDenied('admin.subscription');
  mutate(d => { const t = d.tenants.find(t => t.id === ctx.tenantId)!; const from = t.plan; t.plan = plan; d.auditLogs.unshift({ id: uid(), tenantId: t.id, actorId: ctx.userId, actorName: d.users.find(u => u.id === ctx.userId)?.name ?? 'Owner', action: 'billing.demo_preview', entity: 'tenant', entityId: t.id, summary: `Fictional plan preview: ${from} → ${plan}`, at: nowIso() }); });
}
export type { CreateTicketInput };
export function createTicket(ctx: AccessContext, input: CreateTicketInput['input']): string { return dispatch(ctx, { type: 'ticket.create', input }).id!; }
export function assignTicket(ctx: AccessContext, ticketId: string, assigneeId: string): void { dispatch(ctx, { type: 'ticket.assign', ticketId, assigneeId }); }
export function setTicketStatus(ctx: AccessContext, ticketId: string, status: TicketStatus, resolutionSummary?: string): void { dispatch(ctx, { type: 'ticket.status', ticketId, status, resolutionSummary, pendingReason: status === 'pending' ? 'Awaiting requester information or a dependency' : undefined }); }
export function addTicketMessage(ctx: AccessContext, ticketId: string, body: string, internal: boolean): void { dispatch(ctx, { type: 'ticket.message', ticketId, body, internal }); }
export function rateTicket(ctx: AccessContext, ticketId: string, score: number): void { dispatch(ctx, { type: 'ticket.rate', ticketId, score }); }
export type CreateAssetInput = Extract<Command, { type: 'asset.create' }>['input'];
export function createAsset(ctx: AccessContext, input: CreateAssetInput): string { return dispatch(ctx, { type: 'asset.create', input }).id!; }
export function updateAsset(ctx: AccessContext, assetId: string, patch: Partial<Pick<Asset, 'name' | 'condition' | 'lifecycle' | 'notes' | 'branchId' | 'departmentId' | 'assigneeId' | 'warrantyExpiry'>>): void { dispatch(ctx, { type: 'asset.update', assetId, patch }); }
export function depreciatedValue(a: Pick<Asset, 'purchaseCost' | 'purchaseDate' | 'usefulLifeYears'>, at = new Date()): number {
  const age = Math.max(0, (at.getTime() - Date.parse(a.purchaseDate)) / (365.25 * 86400000));
  return Math.round(a.purchaseCost * Math.max(0, 1 - age / Math.max(1, a.usefulLifeYears)) * 100) / 100;
}
export function createWorkOrder(ctx: AccessContext, input: Omit<Extract<Command, { type: 'workorder.create' }>, 'type'>): void { dispatch(ctx, { type: 'workorder.create', ...input }); }
export function updateWorkOrderStatus(ctx: AccessContext, id: string, status: WorkOrder['status'], patch?: Partial<Pick<WorkOrder, 'labourHours' | 'cost' | 'notes' | 'assigneeId' | 'dueAt' | 'signOffBy'>>): void { dispatch(ctx, { type: 'workorder.status', id, status, ...patch }); }
export function toggleChecklistItem(ctx: AccessContext, workOrderId: string, index: number): void { dispatch(ctx, { type: 'workorder.checklist', workOrderId, index }); }
export function createMaintenancePlan(ctx: AccessContext, input: Omit<Extract<Command, { type: 'maintenance.plan' }>, 'type'>): void { dispatch(ctx, { type: 'maintenance.plan', ...input }); }
export function runMaintenanceScheduler(ctx: AccessContext): number { return dispatch(ctx, { type: 'maintenance.run' }).count ?? 0; }
export function acknowledgeAlert(ctx: AccessContext, id: string): void { dispatch(ctx, { type: 'alert.ack', id }); }
export function resolveAlert(ctx: AccessContext, id: string): void { dispatch(ctx, { type: 'alert.resolve', id }); }
export function simulateDeviceOutage(ctx: AccessContext, deviceId: string): { alertId?: string; incidentId?: string; deduped: boolean } {
  const r = dispatch(ctx, { type: 'device.simulate_outage', deviceId }); return { alertId: r.id, incidentId: (r as { incidentId?: string }).incidentId, deduped: !!r.deduped };
}
export function createProject(ctx: AccessContext, input: Omit<Extract<Command, { type: 'project.create' }>, 'type'>): void { dispatch(ctx, { type: 'project.create', ...input }); }
export function setProjectStatus(ctx: AccessContext, id: string, status: Project['status']): void { dispatch(ctx, { type: 'project.status', id, status }); }
export function addTask(ctx: AccessContext, projectId: string, title: string, column: TaskItem['column']): void { dispatch(ctx, { type: 'task.create', projectId, title, column }); }
export function moveTask(ctx: AccessContext, taskId: string, column: TaskItem['column']): void { dispatch(ctx, { type: 'task.move', taskId, column }); }
export function toggleMilestone(ctx: AccessContext, projectId: string, milestoneId: string): void { dispatch(ctx, { type: 'milestone.toggle', projectId, milestoneId }); }
export function onboardClient(ctx: AccessContext, input: Omit<Extract<Command, { type: 'client.onboard' }>, 'type'>): string { return dispatch(ctx, { type: 'client.onboard', ...input }).id!; }
export function createVendor(ctx: AccessContext, input: Omit<Extract<Command, { type: 'vendor.create' }>, 'type'>): void { dispatch(ctx, { type: 'vendor.create', ...input }); }
export function createPurchaseOrder(ctx: AccessContext, input: { vendorId: string; items: { name: string; qty: number; unitCost: number; kind?: 'capital' | 'consumable' }[]; branchId?: string; note?: string }): void {
  const branchId = input.branchId ?? getData().branches.find(b => b.tenantId === ctx.tenantId && b.status === 'active')?.id;
  if (!branchId) throw new DomainError('Create a branch before requesting purchases');
  dispatch(ctx, { type: 'po.create', vendorId: input.vendorId, branchId, note: input.note, items: input.items.map(i => ({ ...i, kind: i.kind ?? 'consumable' })) });
}
export function setPoStatus(ctx: AccessContext, id: string, status: PurchaseOrder['status']): void { dispatch(ctx, { type: 'po.status', id, status }); }
export function createInvoice(ctx: AccessContext, input: { clientName: string; clientTenantId?: string; items: Invoice['items']; whtRate: number; dueDays: number }): string { return dispatch(ctx, { type: 'invoice.create', ...input, vatRate: .075 }).id!; }
export function setInvoiceStatus(ctx: AccessContext, id: string, status: Invoice['status']): void {
  if (status === 'paid' || status === 'partial' || status === 'overdue') throw new DomainError('Settlement must be recorded with a payment reference, not a status toggle');
  dispatch(ctx, { type: 'invoice.status', id, status });
}
export function createExpense(ctx: AccessContext, input: Omit<Extract<Command, { type: 'expense.create' }>, 'type'>): void { dispatch(ctx, { type: 'expense.create', ...input }); }
export function saveArticle(ctx: AccessContext, input: Omit<Extract<Command, { type: 'article.save' }>, 'type'>): void { dispatch(ctx, { type: 'article.save', ...input }); }
export function saveDocumentRecord(ctx: AccessContext, input: { title: string; kind: DocumentRecord['kind']; summary: string; expiresAt?: string; assetId?: string }): void { dispatch(ctx, { type: 'document.create', ...input }); }
export function addFinding(ctx: AccessContext, input: { assessmentId: string; title: string; severity: Finding['severity']; detail: string }): void { dispatch(ctx, { type: 'finding.create', ...input }); }
export function setFindingStatus(ctx: AccessContext, id: string, status: Finding['status']): void { dispatch(ctx, { type: 'finding.status', id, status, evidence: status === 'remediated' ? 'Verified by the responsible compliance administrator' : undefined }); }
export function upsertRisk(ctx: AccessContext, input: { id?: string; title: string; category: string; likelihood: Risk['likelihood']; impact: Risk['impact']; treatment: string; dueAt?: string }): void { dispatch(ctx, { type: 'risk.save', ...input }); }
export function setRiskStatus(ctx: AccessContext, id: string, status: Risk['status']): void { dispatch(ctx, { type: 'risk.status', id, status, justification: ['accepted', 'closed'].includes(status) ? 'Reviewed and approved by the workspace administrator' : undefined }); }
export function markNotificationRead(tenantId: string, userId: string, id?: string): void {
  const tenant = getData().tenants.find(t => t.id === tenantId);
  const ctx = accessContextFor(getData().memberships, userId, tenantId, tenant?.providerId, getData().delegations);
  if (!ctx) throw new PermissionDenied('itsm.ticket.view.own'); dispatch(ctx, { type: 'notification.read', id });
}
export function recordReportRun(ctx: AccessContext, reportId: string, title: string, params: Record<string, string>): void {
  dispatch(ctx, { type: 'report.run', reportId: reportId as 'exec' | 'itsm' | 'assets' | 'finance', title, params: { from: params.from ?? new Date(Date.now() - 30 * 86400000).toISOString(), to: params.to ?? nowIso(), branchId: params.branchId || undefined } });
}
export function tenantUsers(data: { users: User[]; memberships: import('./types').Membership[] }, tenantId: string): User[] {
  const ids = new Set(data.memberships.filter(m => m.tenantId === tenantId && m.status === 'active').map(m => m.userId)); return data.users.filter(u => ids.has(u.id));
}
export const userById = (data: { users: User[] }, id?: string): User | undefined => data.users.find(u => u.id === id);
export function accessibleTenantIds(data: DataSet, userId: string): string[] {
  const own = data.memberships.filter(m => m.userId === userId && m.status === 'active').map(m => m.tenantId);
  const delegated = data.delegations.filter(g => g.userId === userId && g.status === 'active' && Date.parse(g.expiresAt) > Date.now() && own.includes(g.providerId)).map(g => g.tenantId);
  return [...new Set([...own, ...delegated])].filter(id => data.tenants.some(t => t.id === id && t.status === 'active'));
}

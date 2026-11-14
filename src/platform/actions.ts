/** Async application actions. Demo uses the local reducer; live uses the authenticated API. */
import type { AccessContext } from './permissions';
import type { Command } from './contracts';
import type { CommandResult } from './operations';
import { dispatch as demoDispatch } from './db';
import { getData, useData, enterLive } from './store';
import { api, ApiError } from './api';
import type { Asset, DocumentRecord, Finding, Invoice, Project, PurchaseOrder, Risk, RoleId, TaskItem, TicketStatus, WorkOrder, PlanId, Tenant } from './types';
import type { RegisterInput } from './contracts';

export async function runCommand(ctx: AccessContext, command: Command): Promise<CommandResult> {
  if (useData.getState().mode === 'live') {
    const revision = useData.getState().revision;
    try {
      const response = await api.command(revision, command);
      enterLive(response.snapshot.data, response.snapshot.revision, response.snapshot.serverTime);
      return response.result;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
        try { const snapshot = await api.workspace(); enterLive(snapshot.data, snapshot.revision, snapshot.serverTime); } catch { /* keep prior snapshot */ }
        throw new ApiError('This workspace changed in another session. The latest data has been loaded; review and retry your action.', 'REVISION_CONFLICT', 409);
      }
      throw error;
    }
  }
  return demoDispatch(ctx, command);
}
export async function updateTenantProfile(ctx: AccessContext, patch: Partial<Pick<Tenant,
  'name' | 'city' | 'industry' | 'legalName' | 'tradingName' | 'rcNumber' | 'tin' | 'address' | 'website'
  | 'supportEmail' | 'accountsEmail' | 'billingEmail' | 'bankDetails'>>): Promise<void> { await runCommand(ctx, { type: 'tenant.update', ...patch }); }
export async function createBranch(ctx: AccessContext, name: string, city: string): Promise<void> { await runCommand(ctx, { type: 'branch.create', name, city }); }
export async function createDepartment(ctx: AccessContext, name: string, branchId: string): Promise<void> { await runCommand(ctx, { type: 'department.create', name, branchId }); }
export async function inviteUser(ctx: AccessContext, name: string, email: string, role: RoleId): Promise<void> { await runCommand(ctx, { type: 'user.invite', name, email, role }); }
export async function changeMemberRole(ctx: AccessContext, userId: string, role: RoleId): Promise<void> { await runCommand(ctx, { type: 'user.role', userId, role }); }
export async function setSubscriptionPlan(ctx: AccessContext, plan: PlanId): Promise<void> {
  if (useData.getState().mode === 'live') { const { url } = await api.billingCheckout(plan); window.location.assign(url); return; }
  const { setSubscriptionPlan: demoPlan } = await import('./db'); demoPlan(ctx, plan);
}
export type CreateTicketInput = Extract<Command, { type: 'ticket.create' }>['input'];
export async function createTicket(ctx: AccessContext, input: CreateTicketInput): Promise<string> { return (await runCommand(ctx, { type: 'ticket.create', input })).id!; }
export async function assignTicket(ctx: AccessContext, ticketId: string, assigneeId: string): Promise<void> { await runCommand(ctx, { type: 'ticket.assign', ticketId, assigneeId }); }
export async function setTicketStatus(ctx: AccessContext, ticketId: string, status: TicketStatus, resolutionSummary?: string): Promise<void> { await runCommand(ctx, { type: 'ticket.status', ticketId, status, resolutionSummary, pendingReason: status === 'pending' ? 'Awaiting requester information or a dependency' : undefined }); }
export async function addTicketMessage(ctx: AccessContext, ticketId: string, body: string, internal: boolean): Promise<void> { await runCommand(ctx, { type: 'ticket.message', ticketId, body, internal }); }
export async function rateTicket(ctx: AccessContext, ticketId: string, score: number): Promise<void> { await runCommand(ctx, { type: 'ticket.rate', ticketId, score }); }
export type CreateAssetInput = Extract<Command, { type: 'asset.create' }>['input'];
export async function createAsset(ctx: AccessContext, input: CreateAssetInput): Promise<string> { return (await runCommand(ctx, { type: 'asset.create', input })).id!; }
export async function updateAsset(ctx: AccessContext, assetId: string, patch: Partial<Pick<Asset, 'name' | 'condition' | 'lifecycle' | 'notes' | 'branchId' | 'departmentId' | 'assigneeId' | 'warrantyExpiry'>>): Promise<void> { await runCommand(ctx, { type: 'asset.update', assetId, patch }); }
export async function createWorkOrder(ctx: AccessContext, input: Omit<Extract<Command, { type: 'workorder.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'workorder.create', ...input }); }
export async function updateWorkOrderStatus(ctx: AccessContext, id: string, status: WorkOrder['status'], patch?: Partial<Pick<WorkOrder, 'labourHours' | 'cost' | 'notes' | 'assigneeId' | 'dueAt' | 'signOffBy'>>): Promise<void> { await runCommand(ctx, { type: 'workorder.status', id, status, ...patch }); }
export async function toggleChecklistItem(ctx: AccessContext, workOrderId: string, index: number): Promise<void> { await runCommand(ctx, { type: 'workorder.checklist', workOrderId, index }); }
export async function createMaintenancePlan(ctx: AccessContext, input: Omit<Extract<Command, { type: 'maintenance.plan' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'maintenance.plan', ...input }); }
export async function runMaintenanceScheduler(ctx: AccessContext): Promise<number> { return (await runCommand(ctx, { type: 'maintenance.run' })).count ?? 0; }
export async function acknowledgeAlert(ctx: AccessContext, id: string): Promise<void> { await runCommand(ctx, { type: 'alert.ack', id }); }
export async function resolveAlert(ctx: AccessContext, id: string): Promise<void> { await runCommand(ctx, { type: 'alert.resolve', id }); }
export async function simulateDeviceOutage(ctx: AccessContext, deviceId: string): Promise<{ alertId?: string; incidentId?: string; deduped: boolean }> {
  if (useData.getState().mode === 'live') throw new ApiError('Outage simulation is demo-only. Live alerts come from authenticated monitoring agents.', 'DEMO_ONLY', 400);
  const r = await runCommand(ctx, { type: 'device.simulate_outage', deviceId }); return { alertId: r.id, incidentId: (r as { incidentId?: string }).incidentId, deduped: !!r.deduped };
}
export async function createProject(ctx: AccessContext, input: Omit<Extract<Command, { type: 'project.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'project.create', ...input }); }
export async function setProjectStatus(ctx: AccessContext, id: string, status: Project['status']): Promise<void> { await runCommand(ctx, { type: 'project.status', id, status }); }
export async function addTask(ctx: AccessContext, projectId: string, title: string, column: TaskItem['column']): Promise<void> { await runCommand(ctx, { type: 'task.create', projectId, title, column }); }
export async function moveTask(ctx: AccessContext, taskId: string, column: TaskItem['column']): Promise<void> { await runCommand(ctx, { type: 'task.move', taskId, column }); }
export async function toggleMilestone(ctx: AccessContext, projectId: string, milestoneId: string): Promise<void> { await runCommand(ctx, { type: 'milestone.toggle', projectId, milestoneId }); }
export async function onboardClient(ctx: AccessContext, input: Omit<Extract<Command, { type: 'client.onboard' }>, 'type'>): Promise<string> { return (await runCommand(ctx, { type: 'client.onboard', ...input })).id!; }
export async function createVendor(ctx: AccessContext, input: Omit<Extract<Command, { type: 'vendor.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'vendor.create', ...input }); }
export async function createPurchaseOrder(ctx: AccessContext, input: { vendorId: string; items: { name: string; qty: number; unitCost: number; kind?: 'capital' | 'consumable' }[]; branchId?: string; note?: string }): Promise<void> {
  const branchId = input.branchId ?? getData().branches.find(b => b.tenantId === ctx.tenantId && b.status === 'active')?.id;
  if (!branchId) throw new Error('Create a branch before requesting purchases');
  await runCommand(ctx, { type: 'po.create', vendorId: input.vendorId, branchId, note: input.note, items: input.items.map(i => ({ ...i, kind: i.kind ?? 'consumable' })) });
}
export async function setPoStatus(ctx: AccessContext, id: string, status: PurchaseOrder['status'], receivedBranchId?: string): Promise<void> { await runCommand(ctx, { type: 'po.status', id, status, receivedBranchId }); }
export async function createInvoice(ctx: AccessContext, input: { clientName: string; clientTenantId?: string; items: Invoice['items']; whtRate: number; dueDays: number; vatRate?: number }): Promise<string> { return (await runCommand(ctx, { type: 'invoice.create', ...input, vatRate: input.vatRate ?? .075 })).id!; }
export async function setInvoiceStatus(ctx: AccessContext, id: string, status: 'draft' | 'sent' | 'cancelled'): Promise<void> { await runCommand(ctx, { type: 'invoice.status', id, status }); }
export async function recordPayment(ctx: AccessContext, invoiceId: string, amount: number, method: 'bank_transfer' | 'cash' | 'withholding_credit', reference: string): Promise<void> { await runCommand(ctx, { type: 'payment.record', invoiceId, amount, method, reference }); }
export async function createExpense(ctx: AccessContext, input: Omit<Extract<Command, { type: 'expense.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'expense.create', ...input }); }
export async function saveArticle(ctx: AccessContext, input: Omit<Extract<Command, { type: 'article.save' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'article.save', ...input }); }
export async function saveDocumentRecord(ctx: AccessContext, input: { title: string; kind: DocumentRecord['kind']; summary: string; expiresAt?: string; assetId?: string }): Promise<void> { await runCommand(ctx, { type: 'document.create', ...input }); }
export async function addFinding(ctx: AccessContext, input: { assessmentId: string; title: string; severity: Finding['severity']; detail: string }): Promise<void> { await runCommand(ctx, { type: 'finding.create', ...input }); }
export async function setFindingStatus(ctx: AccessContext, id: string, status: Finding['status'], evidence?: string): Promise<void> { await runCommand(ctx, { type: 'finding.status', id, status, evidence }); }
export async function upsertRisk(ctx: AccessContext, input: { id?: string; title: string; category: string; likelihood: Risk['likelihood']; impact: Risk['impact']; treatment: string; dueAt?: string }): Promise<void> { await runCommand(ctx, { type: 'risk.save', ...input }); }
export async function setRiskStatus(ctx: AccessContext, id: string, status: Risk['status'], justification?: string): Promise<void> { await runCommand(ctx, { type: 'risk.status', id, status, justification }); }
export async function markNotificationRead(ctx: AccessContext, id?: string): Promise<void> { await runCommand(ctx, { type: 'notification.read', id }); }
export async function recordReportRun(ctx: AccessContext, reportId: string, title: string, params: Record<string, string>): Promise<void> {
  await runCommand(ctx, { type: 'report.run', reportId: reportId as 'exec' | 'itsm' | 'assets' | 'finance', title, params: { from: params.from ?? new Date(Date.now() - 30 * 86400000).toISOString(), to: params.to ?? new Date().toISOString(), branchId: params.branchId || undefined } });
}
export async function registerLive(input: RegisterInput): Promise<{ message: string }> { return api.register(input); }

export async function updateSla(ctx: AccessContext, input: Omit<Extract<Command, { type: 'sla.update' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'sla.update', ...input }); }
export async function deactivateUser(ctx: AccessContext, userId: string): Promise<void> { await runCommand(ctx, { type: 'user.deactivate', userId }); }
export async function revokeInvitation(ctx: AccessContext, id: string): Promise<void> { await runCommand(ctx, { type: 'invitation.revoke', id }); }
export async function grantDelegation(ctx: AccessContext, input: Omit<Extract<Command, { type: 'delegation.grant' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'delegation.grant', ...input }); }
export async function revokeDelegation(ctx: AccessContext, id: string): Promise<void> { await runCommand(ctx, { type: 'delegation.revoke', id }); }
export async function scheduleReport(ctx: AccessContext, input: Omit<Extract<Command, { type: 'report.schedule' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'report.schedule', ...input }); }
export async function pauseReportSchedule(ctx: AccessContext, id: string, active: boolean): Promise<void> { await runCommand(ctx, { type: 'report.schedule.pause', id, active }); }
export async function requestPrivacy(ctx: AccessContext, kind: 'export' | 'erasure', reason: string): Promise<void> { await runCommand(ctx, { type: 'privacy.request', kind, reason }); }
export async function resolvePrivacy(ctx: AccessContext, id: string, status: 'completed' | 'rejected', reason: string): Promise<void> { await runCommand(ctx, { type: 'privacy.resolve', id, status, reason }); }
export async function createDevice(ctx: AccessContext, input: Omit<Extract<Command, { type: 'device.create' }>, 'type'>): Promise<{ id?: string; deviceToken?: string }> { return runCommand(ctx, { type: 'device.create', ...input }); }
export async function updateDevice(ctx: AccessContext, input: Omit<Extract<Command, { type: 'device.update' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'device.update', ...input }); }
export async function approveTicket(ctx: AccessContext, ticketId: string): Promise<void> { await runCommand(ctx, { type: 'ticket.approve', ticketId }); }
export async function adjustStock(ctx: AccessContext, id: string, delta: number, reason: string): Promise<void> { await runCommand(ctx, { type: 'stock.adjust', id, delta, reason }); }
export async function createBudget(ctx: AccessContext, input: Omit<Extract<Command, { type: 'budget.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'budget.create', ...input }); }
export async function addDocumentVersion(ctx: AccessContext, id: string, summary: string, expiresAt?: string): Promise<void> { await runCommand(ctx, { type: 'document.version', id, summary, expiresAt }); }
export async function createAssessment(ctx: AccessContext, input: Omit<Extract<Command, { type: 'assessment.create' }>, 'type'>): Promise<void> { await runCommand(ctx, { type: 'assessment.create', ...input }); }
export async function answerAssessment(ctx: AccessContext, id: string, controlId: string, response: 'yes' | 'no' | 'na', evidence: string): Promise<void> { await runCommand(ctx, { type: 'assessment.answer', id, controlId, response, evidence }); }
export async function completeAssessment(ctx: AccessContext, id: string): Promise<void> { await runCommand(ctx, { type: 'assessment.complete', id }); }
export async function pauseMaintenancePlan(ctx: AccessContext, id: string, active: boolean): Promise<void> { await runCommand(ctx, { type: 'maintenance.pause', id, active }); }
export async function createMilestone(ctx: AccessContext, projectId: string, title: string, dueAt: string): Promise<void> { await runCommand(ctx, { type: 'milestone.create', projectId, title, dueAt }); }
export async function updateNotificationSettings(ctx: AccessContext, notificationEmails: boolean): Promise<void> { await runCommand(ctx, { type: 'tenant.update', notificationEmails }); }

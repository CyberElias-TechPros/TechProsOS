/** Shared command contract. The live API parses this BEFORE entering the domain.
 * Identity, tenant and role are deliberately absent: they come from the server session.
 * The demo adapter uses the same contract, but is not a security boundary.
 */
import { z } from 'zod';

export const id = z.string().trim().min(1).max(100);
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const longText = z.string().trim().min(1).max(20_000);
export const email = z.string().trim().toLowerCase().email().max(254);
export const money = z.number().finite().min(0).max(1_000_000_000_000);
export const positiveMoney = money.refine(n => n > 0, 'Amount must be greater than zero');
export const quantity = z.number().finite().positive().max(1_000_000);
export const isoDate = z.string().refine(s => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) && Number.isFinite(Date.parse(s)), 'Enter a valid date');
export const futureDate = isoDate;
export const role = z.enum(['org_owner', 'org_admin', 'it_manager', 'it_technician', 'network_engineer', 'security_officer', 'procurement_officer', 'finance_officer', 'dept_manager', 'employee', 'auditor', 'svc_delivery_manager', 'account_manager', 'support_lead', 'field_technician', 'project_manager']);
export const permission = z.enum([
  'itsm.ticket.create', 'itsm.ticket.view.own', 'itsm.ticket.view.team', 'itsm.ticket.view.all', 'itsm.ticket.assign', 'itsm.ticket.update', 'itsm.ticket.close',
  'assets.asset.view', 'assets.asset.create', 'assets.asset.update', 'assets.asset.transfer', 'assets.asset.dispose',
  'maintenance.workorder.view', 'maintenance.workorder.manage', 'maintenance.plan.manage',
  'infrastructure.device.view', 'infrastructure.device.manage', 'infrastructure.alert.manage',
  'projects.project.view', 'projects.project.manage', 'clients.client.view', 'clients.client.manage',
  'procurement.vendor.manage', 'procurement.po.view', 'procurement.po.create', 'procurement.po.approve', 'procurement.stock.manage',
  'finance.invoice.view', 'finance.invoice.manage', 'finance.expense.manage', 'finance.budget.manage',
  'docs.content.view', 'docs.content.manage', 'compliance.item.view', 'compliance.item.manage',
  'reports.report.view', 'reports.report.export', 'ai.assistant.use', 'tools.use',
  'admin.org', 'admin.users', 'admin.subscription', 'admin.audit', 'admin.integrations',
]);
const level = z.enum(['high', 'medium', 'low']);
const ticketStatus = z.enum(['new', 'triaged', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']);
const invoiceItem = z.object({ desc: text(300), qty: quantity, unitPrice: money }).strict();
const poItem = z.object({ name: text(200), qty: z.number().int().min(1).max(1000), unitCost: money, kind: z.enum(['capital', 'consumable']) }).strict();
const ticketInput = z.object({
  kind: z.enum(['incident', 'request', 'problem', 'change']), title: text(200), description: longText,
  category: text(100), impact: level, urgency: level, branchId: id.optional(), departmentId: id.optional(),
  assetId: id.optional(), requesterId: id.optional(), source: z.enum(['portal', 'email', 'monitoring', 'phone', 'walkin']).optional(),
  changePlan: z.string().max(10_000).optional(), rollbackPlan: z.string().max(10_000).optional(), scheduledAt: isoDate.optional(),
}).strict();
const assetInput = z.object({
  name: text(200), category: text(100), manufacturer: z.string().max(100), model: z.string().max(100), serial: z.string().max(150),
  branchId: id, departmentId: id.optional(), assigneeId: id.optional(), purchaseDate: isoDate, purchaseCost: money,
  usefulLifeYears: z.number().int().min(1).max(50), warrantyExpiry: isoDate.optional(),
}).strict();
const target = z.object({ response: z.number().int().min(1).max(525600), resolve: z.number().int().min(1).max(525600) }).strict();
const targets = z.object({ critical: target, high: target, medium: target, low: target }).strict();

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tenant.update'), name: text(160).optional(), city: text(100).optional(), industry: text(100).optional(), billingEmail: email.optional(), bankDetails: z.object({ bank: text(100), accountName: text(160), accountNumber: z.string().regex(/^\d{10}$/, 'Use a 10-digit NUBAN') }).strict().optional(), notificationEmails: z.boolean().optional(), legalName: text(160).optional(), tradingName: text(160).optional(), rcNumber: z.string().regex(/^\d{1,10}$/, 'RC number must be digits').optional(), tin: z.string().regex(/^\d{8,15}$/, 'TIN must be 8-15 digits').optional(), address: text(300).optional(), website: text(200).optional(), supportEmail: email.optional(), accountsEmail: email.optional() }).strict(),
  z.object({ type: z.literal('sla.update'), name: text(120), timezone: z.literal('Africa/Lagos'), workStartHour: z.number().int().min(0).max(23), workEndHour: z.number().int().min(1).max(24), workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100), targets }).strict(),
  z.object({ type: z.literal('branch.create'), name: text(120), city: text(100) }).strict(),
  z.object({ type: z.literal('department.create'), name: text(120), branchId: id }).strict(),
  z.object({ type: z.literal('user.invite'), name: text(120), email, role }).strict(),
  z.object({ type: z.literal('user.role'), userId: id, role }).strict(),
  z.object({ type: z.literal('user.deactivate'), userId: id }).strict(),
  z.object({ type: z.literal('invitation.revoke'), id }).strict(),
  z.object({ type: z.literal('delegation.grant'), clientTenantId: id, userId: id, permissions: z.array(permission).min(1).max(50), expiresAt: futureDate }).strict(),
  z.object({ type: z.literal('delegation.revoke'), id }).strict(),
  z.object({ type: z.literal('ticket.create'), input: ticketInput }).strict(),
  z.object({ type: z.literal('ticket.assign'), ticketId: id, assigneeId: id }).strict(),
  z.object({ type: z.literal('ticket.status'), ticketId: id, status: ticketStatus, resolutionSummary: z.string().max(10_000).optional(), pendingReason: z.string().max(1000).optional(), resolutionArticleId: id.optional() }).strict(),
  z.object({ type: z.literal('ticket.message'), ticketId: id, body: longText, internal: z.boolean() }).strict(),
  z.object({ type: z.literal('ticket.rate'), ticketId: id, score: z.number().int().min(1).max(5) }).strict(),
  z.object({ type: z.literal('ticket.approve'), ticketId: id }).strict(),
  z.object({ type: z.literal('asset.create'), input: assetInput }).strict(),
  z.object({ type: z.literal('asset.import'), rows: z.array(assetInput).min(1).max(500) }).strict(),
  z.object({ type: z.literal('asset.update'), assetId: id, patch: assetInput.partial().extend({ condition: z.enum(['excellent', 'good', 'fair', 'poor']).optional(), lifecycle: z.enum(['in_service', 'in_storage', 'in_repair', 'retired', 'disposed']).optional(), notes: z.string().max(10_000).optional() }).strict() }).strict(),
  z.object({ type: z.literal('workorder.create'), title: text(200), kind: z.enum(['preventive', 'corrective']), assetId: id.optional(), planId: id.optional(), assigneeId: id.optional(), dueAt: isoDate, checklist: z.array(text(300)).max(100), branchId: id.optional() }).strict(),
  z.object({ type: z.literal('workorder.status'), id, status: z.enum(['open', 'scheduled', 'in_progress', 'completed', 'cancelled']), labourHours: z.number().min(0).max(10000).optional(), cost: money.optional(), notes: z.string().max(10_000).optional(), assigneeId: id.optional(), dueAt: isoDate.optional(), signOffBy: text(120).optional() }).strict(),
  z.object({ type: z.literal('workorder.checklist'), workOrderId: id, index: z.number().int().min(0).max(99) }).strict(),
  z.object({ type: z.literal('maintenance.plan'), name: text(160), assetCategory: text(100), intervalMonths: z.number().int().min(1).max(120), checklist: z.array(text(300)).min(1).max(100), assigneeId: id, nextRunAt: isoDate }).strict(),
  z.object({ type: z.literal('maintenance.run') }).strict(),
  z.object({ type: z.literal('maintenance.pause'), id, active: z.boolean() }).strict(),
  z.object({ type: z.literal('device.create'), name: text(160), kind: z.enum(['wan', 'router', 'firewall', 'switch', 'ap', 'server', 'ups', 'printer', 'cctv']), model: z.string().max(120), ip: z.string().max(45), branchId: id, parentId: id.optional(), monitored: z.boolean() }).strict(),
  z.object({ type: z.literal('device.update'), id, name: text(160).optional(), parentId: id.optional(), monitored: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('device.simulate_outage'), deviceId: id }).strict(),
  z.object({ type: z.literal('alert.ack'), id }).strict(),
  z.object({ type: z.literal('alert.resolve'), id }).strict(),
  z.object({ type: z.literal('project.create'), name: text(160), kind: text(100), managerId: id, budget: money, dueAt: isoDate, description: z.string().max(10_000), clientTenantId: id.optional(), branchId: id.optional() }).strict(),
  z.object({ type: z.literal('project.status'), id, status: z.enum(['planning', 'in_progress', 'on_hold', 'completed']) }).strict(),
  z.object({ type: z.literal('task.create'), projectId: id, title: text(200), column: z.enum(['backlog', 'todo', 'doing', 'review', 'done']), assigneeId: id.optional(), dueAt: isoDate.optional() }).strict(),
  z.object({ type: z.literal('task.move'), taskId: id, column: z.enum(['backlog', 'todo', 'doing', 'review', 'done']) }).strict(),
  z.object({ type: z.literal('milestone.create'), projectId: id, title: text(160), dueAt: isoDate }).strict(),
  z.object({ type: z.literal('milestone.toggle'), projectId: id, milestoneId: id }).strict(),
  z.object({ type: z.literal('client.onboard'), name: text(160), industry: text(100), city: text(100), contactName: text(120), contactEmail: email, tier: z.enum(['Essential', 'Managed', 'Premium']), monthlyFee: money }).strict(),
  z.object({ type: z.literal('assistant.consume') }).strict(),
  z.object({ type: z.literal('vendor.create'), name: text(160), category: text(100), contact: text(120), phone: z.string().max(30), email: email.or(z.literal('')) }).strict(),
  z.object({ type: z.literal('po.create'), vendorId: id, items: z.array(poItem).min(1).max(100), branchId: id, note: z.string().max(5000).optional() }).strict(),
  z.object({ type: z.literal('po.status'), id, status: z.enum(['requested', 'approved', 'ordered', 'received', 'cancelled']), receivedBranchId: id.optional() }).strict(),
  z.object({ type: z.literal('stock.adjust'), id, delta: z.number().int().min(-1_000_000).max(1_000_000), reason: text(500) }).strict(),
  z.object({ type: z.literal('invoice.create'), clientName: text(160), clientTenantId: id.optional(), items: z.array(invoiceItem).min(1).max(100), vatRate: z.number().min(0).max(1).default(0.075), whtRate: z.number().min(0).max(0.5), dueDays: z.number().int().min(0).max(365), notes: z.string().max(5000).optional() }).strict(),
  z.object({ type: z.literal('invoice.status'), id, status: z.enum(['draft', 'sent', 'cancelled']) }).strict(),
  z.object({ type: z.literal('payment.record'), invoiceId: id, amount: positiveMoney, method: z.enum(['bank_transfer', 'cash', 'withholding_credit']), reference: text(200), creditNoteRef: text(200).optional() }).strict(),
  z.object({ type: z.literal('expense.create'), title: text(200), category: text(100), amount: positiveMoney, branchId: id.optional(), departmentId: id.optional(), projectId: id.optional(), vendorId: id.optional() }).strict(),
  z.object({ type: z.literal('budget.create'), name: text(160), departmentId: id.optional(), year: z.number().int().min(2000).max(2100), amount: positiveMoney }).strict(),
  z.object({ type: z.literal('article.save'), id: id.optional(), title: text(200), body: longText, category: text(100), tags: z.array(text(50)).max(20), publish: z.boolean() }).strict(),
  z.object({ type: z.literal('document.create'), title: text(200), kind: z.enum(['policy', 'sop', 'diagram', 'manual', 'report', 'handover']), summary: longText, expiresAt: isoDate.optional(), assetId: id.optional() }).strict(),
  z.object({ type: z.literal('document.version'), id, summary: longText, expiresAt: isoDate.optional() }).strict(),
  z.object({ type: z.literal('assessment.create'), name: text(160), framework: z.enum(['ISO 27001', 'NIST CSF', 'NDPA', 'Internal']), controls: z.array(z.object({ title: text(300) }).strict()).min(1).max(200) }).strict(),
  z.object({ type: z.literal('assessment.answer'), id, controlId: id, response: z.enum(['yes', 'no', 'na']), evidence: z.string().max(5000) }).strict(),
  z.object({ type: z.literal('assessment.complete'), id }).strict(),
  z.object({ type: z.literal('finding.create'), assessmentId: id, title: text(200), severity: z.enum(['critical', 'high', 'medium', 'low']), detail: longText, dueAt: isoDate.optional(), ownerId: id.optional() }).strict(),
  z.object({ type: z.literal('finding.status'), id, status: z.enum(['open', 'in_progress', 'remediated']), evidence: z.string().max(5000).optional() }).strict(),
  z.object({ type: z.literal('risk.save'), id: id.optional(), title: text(200), category: text(100), likelihood: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), impact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), treatment: longText, dueAt: isoDate.optional() }).strict(),
  z.object({ type: z.literal('risk.status'), id, status: z.enum(['open', 'mitigating', 'accepted', 'closed']), justification: z.string().max(5000).optional() }).strict(),
  z.object({ type: z.literal('notification.read'), id: id.optional() }).strict(),
  z.object({ type: z.literal('report.run'), reportId: z.enum(['exec', 'itsm', 'assets', 'finance']), title: text(160), params: z.object({ from: isoDate, to: isoDate, branchId: id.optional() }).strict() }).strict(),
  z.object({ type: z.literal('report.schedule'), reportId: z.enum(['exec', 'itsm', 'assets', 'finance']), name: text(160), cadence: z.enum(['daily', 'weekly', 'monthly']), recipients: z.array(email).min(1).max(10), nextRunAt: futureDate, branchId: id.optional() }).strict(),
  z.object({ type: z.literal('report.schedule.pause'), id, active: z.boolean() }).strict(),
  z.object({ type: z.literal('privacy.request'), kind: z.enum(['export', 'erasure']), reason: text(2000) }).strict(),
  z.object({ type: z.literal('privacy.resolve'), id, status: z.enum(['completed', 'rejected']), reason: text(2000) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

export const registerSchema = z.object({
  orgName: text(160), industry: text(100), city: text(100), plan: z.enum(['starter', 'professional', 'business', 'msp_launch', 'msp_growth', 'msp_scale']),
  type: z.enum(['organisation', 'service_provider']), ownerName: text(120), ownerEmail: email, ownerPhone: z.string().max(30),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  branches: z.array(z.object({ name: text(120), city: text(100) }).strict()).min(1).max(20),
  departments: z.array(text(120)).min(1).max(50), consent: z.literal(true),
}).strict();
export type RegisterInput = z.infer<typeof registerSchema>;
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const acceptInviteSchema = tokenSchema.extend({ name: text(120), password: z.string().min(12).max(128).optional() }).strict();
export const resetRequestSchema = z.object({ email }).strict();
export const resetSchema = tokenSchema.extend({ password: z.string().min(12).max(128), code: z.string().max(20).optional() }).strict();
export const mfaVerifySchema = z.object({ challenge: z.string().max(200), code: z.string().min(6).max(20) }).strict();
export const commandEnvelope = z.object({ revision: z.number().int().nonnegative(), command: commandSchema }).strict();

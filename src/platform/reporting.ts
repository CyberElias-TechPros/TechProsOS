/** Least-privilege read model. Live responses are projected on the server;
 * the demo uses the same projection so UI behaviour is consistent.
 */
import { can, type AccessContext } from './permissions';
import type { DataSet } from './types';
import { visibleTickets } from './metrics';
import { emptyData } from './operations';
import { assignableUsers } from './operations';

export function projectWorkspace(data: DataSet, ctx: AccessContext): DataSet {
  const t = ctx.tenantId;
  const own = <T extends { tenantId: string }>(rows: T[], allowed: boolean) => allowed ? rows.filter(x => x.tenantId === t) : [];
  const tickets = visibleTickets(data, ctx);
  const ticketIds = new Set(tickets.map(x => x.id));
  const staff = can(ctx, 'itsm.ticket.update');
  const admin = can(ctx, 'admin.users');
  const directory = admin || can(ctx, 'itsm.ticket.assign');
  const memberIds = new Set(data.memberships.filter(m => m.tenantId === t && m.status === 'active').map(m => m.userId));
  const visibleUserIds = new Set([ctx.userId, ...tickets.flatMap(x => [x.requesterId, x.assigneeId].filter(Boolean) as string[])]);
  const users = data.users.filter(u => (directory && memberIds.has(u.id)) || (can(ctx, 'itsm.ticket.assign') && assignableUsers(data, ctx).some(x => x.id === u.id)) || visibleUserIds.has(u.id))
    .map(u => u.id === ctx.userId || admin ? u : { ...u, email: '', phone: '' });
  const memberships = data.memberships.filter(m => m.tenantId === t && (directory || m.userId === ctx.userId));
  const allowedTenants = data.tenants.filter(x => x.id === t ||
    data.memberships.some(m => m.userId === ctx.userId && m.tenantId === x.id && m.status === 'active') ||
    (x.providerId && data.delegations.some(g => g.tenantId === x.id && g.userId === ctx.userId && g.providerId === x.providerId && g.status === 'active' && Date.parse(g.expiresAt) > Date.now())) ||
    (x.providerId === t && can(ctx, 'clients.client.view')));
  const finance = can(ctx, 'finance.invoice.view');
  const docs = can(ctx, 'docs.content.view');
  const projects = can(ctx, 'projects.project.view') || can(ctx, 'projects.project.manage');
  const procurement = can(ctx, 'procurement.po.view') || can(ctx, 'procurement.po.create');
  return {
    ...emptyData(),
    tenants: allowedTenants.map(x => x.id === t ? x : { ...x, billingEmail: undefined, bankDetails: undefined }),
    users, memberships,
    invitations: own(data.invitations, admin),
    branches: own(data.branches, true), departments: own(data.departments, true),
    tickets, ticketMessages: data.ticketMessages.filter(m => m.tenantId === t && ticketIds.has(m.ticketId) && (!m.internal || staff)),
    slaPolicies: own(data.slaPolicies, true),
    assets: own(data.assets, can(ctx, 'assets.asset.view')),
    maintenancePlans: own(data.maintenancePlans, can(ctx, 'maintenance.workorder.view') || can(ctx, 'maintenance.plan.manage')),
    workOrders: own(data.workOrders, can(ctx, 'maintenance.workorder.view') || can(ctx, 'maintenance.workorder.manage')),
    devices: own(data.devices, can(ctx, 'infrastructure.device.view')), alerts: own(data.alerts, can(ctx, 'infrastructure.device.view')),
    projects: own(data.projects, projects), tasks: own(data.tasks, projects),
    agreements: own(data.agreements, can(ctx, 'clients.client.view')), contacts: own(data.contacts, can(ctx, 'clients.client.view')),
    vendors: own(data.vendors, procurement || can(ctx, 'procurement.vendor.manage')),
    purchaseOrders: own(data.purchaseOrders, procurement), stockItems: own(data.stockItems, procurement || can(ctx, 'procurement.stock.manage')),
    invoices: own(data.invoices, finance), expenses: own(data.expenses, finance || can(ctx, 'finance.expense.manage')), budgets: own(data.budgets, finance || can(ctx, 'finance.budget.manage')),
    articles: own(data.articles, docs).filter(a => a.status === 'published' || can(ctx, 'docs.content.manage')),
    documents: own(data.documents, docs),
    assessments: own(data.assessments, can(ctx, 'compliance.item.view')), findings: own(data.findings, can(ctx, 'compliance.item.view')), risks: own(data.risks, can(ctx, 'compliance.item.view')),
    auditLogs: can(ctx, 'admin.audit') ? own(data.auditLogs, true) : staff ? data.auditLogs.filter(a => a.tenantId === t && a.entity === 'ticket' && ticketIds.has(a.entityId)) : [],
    notifications: data.notifications.filter(n => n.tenantId === t && n.userId === ctx.userId),
    reportRuns: own(data.reportRuns, can(ctx, 'reports.report.view')),
    reportSchedules: own(data.reportSchedules, can(ctx, 'reports.report.export')).filter(s => s.createdBy === ctx.userId || can(ctx, 'admin.org')),
    delegations: data.delegations.filter(g => (g.tenantId === t && can(ctx, 'admin.org')) || (g.providerId === t && can(ctx, 'clients.client.manage')) || g.userId === ctx.userId),
    privacyRequests: own(data.privacyRequests, true).filter(r => r.userId === ctx.userId || can(ctx, 'admin.org')),
    attachments: data.attachments.filter(a => a.tenantId === t && (ticketIds.has(a.entityId) || (can(ctx, 'assets.asset.view') && data.assets.some(x => x.id === a.entityId && x.tenantId === t)) || (docs && data.documents.some(x => x.id === a.entityId && x.tenantId === t)))),
    counters: Object.fromEntries(Object.entries(data.counters).filter(([key]) => key.startsWith(`${t}:`))),
  };
}

export interface ReportParams { from: string; to: string; branchId?: string }
export function filterReportData(data: DataSet, ctx: AccessContext, params?: ReportParams): DataSet {
  const d = projectWorkspace(data, ctx);
  if (!params) return d;
  const start = Date.parse(params.from), end = Date.parse(params.to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('Invalid report period');
  // Inclusive calendar dates, interpreted in the workspace's Lagos calendar.
  const from = new Date(`${params.from.slice(0, 10)}T00:00:00+01:00`).getTime();
  const to = new Date(`${params.to.slice(0, 10)}T23:59:59.999+01:00`).getTime();
  const inPeriod = (date: string) => { const ms = Date.parse(date); return ms >= from && ms <= to; };
  const branch = (row: { branchId?: string }) => !params.branchId || row.branchId === params.branchId;
  const ticketIds = new Set(d.tickets.filter(x => inPeriod(x.createdAt) && branch(x)).map(x => x.id));
  const projectIds = new Set(d.projects.filter(x => inPeriod(x.createdAt) && branch(x)).map(x => x.id));
  return {
    ...d,
    tickets: d.tickets.filter(x => ticketIds.has(x.id)), ticketMessages: d.ticketMessages.filter(x => ticketIds.has(x.ticketId)),
    assets: d.assets.filter(x => Date.parse(x.createdAt) <= to && branch(x)),
    expenses: d.expenses.filter(x => inPeriod(x.incurredAt) && branch(x)),
    invoices: d.invoices.filter(x => inPeriod(x.issuedAt)),
    workOrders: d.workOrders.filter(x => inPeriod(x.createdAt) && branch(x)),
    projects: d.projects.filter(x => projectIds.has(x.id)), tasks: d.tasks.filter(x => projectIds.has(x.projectId)),
    purchaseOrders: d.purchaseOrders.filter(x => inPeriod(x.createdAt) && branch(x)),
    devices: d.devices.filter(branch), alerts: d.alerts.filter(x => inPeriod(x.createdAt)),
    risks: d.risks.filter(x => Date.parse(x.createdAt) <= to), findings: d.findings,
    auditLogs: d.auditLogs.filter(x => inPeriod(x.at)), reportRuns: d.reportRuns.filter(x => inPeriod(x.at)),
  };
}

/** Prevent spreadsheet formula execution in every exported user-controlled cell. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (typeof value !== 'number' && (/^[=+\-@\t\r\n]/.test(s) || /^\s+[=+\-@]/.test(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function toCsv<T extends object>(rows: T[], columns: { key: keyof T; label: string }[]): string {
  return '\uFEFF' + [columns.map(c => csvCell(c.label)).join(','), ...rows.map(row => columns.map(c => csvCell(row[c.key])).join(','))].join('\r\n');
}
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Permission engine — README §6: RBAC + resource-level scope, tenant-scoped.
 * Permissions use the `module.resource.action.scope` convention.
 * These contracts are the seam the production API enforces server-side;
 * in this build the data layer (db.ts) enforces them on every operation.
 */
import type { ID, Membership, RoleId } from './types';

export type Permission =
  | 'itsm.ticket.create' | 'itsm.ticket.view.own' | 'itsm.ticket.view.team' | 'itsm.ticket.view.all'
  | 'itsm.ticket.assign' | 'itsm.ticket.update' | 'itsm.ticket.close'
  | 'assets.asset.view' | 'assets.asset.create' | 'assets.asset.update' | 'assets.asset.transfer' | 'assets.asset.dispose'
  | 'maintenance.workorder.view' | 'maintenance.workorder.manage' | 'maintenance.plan.manage'
  | 'infrastructure.device.view' | 'infrastructure.device.manage' | 'infrastructure.alert.manage'
  | 'projects.project.view' | 'projects.project.manage'
  | 'clients.client.view' | 'clients.client.manage'
  | 'procurement.vendor.manage' | 'procurement.po.view' | 'procurement.po.create' | 'procurement.po.approve' | 'procurement.stock.manage'
  | 'finance.invoice.view' | 'finance.invoice.manage' | 'finance.expense.manage' | 'finance.budget.manage'
  | 'docs.content.view' | 'docs.content.manage'
  | 'compliance.item.view' | 'compliance.item.manage'
  | 'reports.report.view' | 'reports.report.export'
  | 'ai.assistant.use'
  | 'tools.use'
  | 'admin.org' | 'admin.users' | 'admin.subscription' | 'admin.audit' | 'admin.integrations';

export const ROLE_LABELS: Record<RoleId, string> = {
  org_owner: 'Organisation Owner',
  org_admin: 'Organisation Administrator',
  it_manager: 'IT Manager',
  it_technician: 'IT Technician',
  network_engineer: 'Network Engineer',
  security_officer: 'Security Officer',
  procurement_officer: 'Procurement Officer',
  finance_officer: 'Finance Officer',
  dept_manager: 'Department Manager',
  employee: 'Employee',
  auditor: 'Auditor',
  svc_delivery_manager: 'Service Delivery Manager',
  account_manager: 'Client Account Manager',
  support_lead: 'Support Team Lead',
  field_technician: 'Field Technician',
  project_manager: 'Project Manager',
};

const EVERYTHING: Permission[] = [
  'itsm.ticket.create', 'itsm.ticket.view.own', 'itsm.ticket.view.team', 'itsm.ticket.view.all',
  'itsm.ticket.assign', 'itsm.ticket.update', 'itsm.ticket.close',
  'assets.asset.view', 'assets.asset.create', 'assets.asset.update', 'assets.asset.transfer', 'assets.asset.dispose',
  'maintenance.workorder.view', 'maintenance.workorder.manage', 'maintenance.plan.manage',
  'infrastructure.device.view', 'infrastructure.device.manage', 'infrastructure.alert.manage',
  'projects.project.view', 'projects.project.manage',
  'clients.client.view', 'clients.client.manage',
  'procurement.vendor.manage', 'procurement.po.view', 'procurement.po.create', 'procurement.po.approve', 'procurement.stock.manage',
  'finance.invoice.view', 'finance.invoice.manage', 'finance.expense.manage', 'finance.budget.manage',
  'docs.content.view', 'docs.content.manage',
  'compliance.item.view', 'compliance.item.manage',
  'reports.report.view', 'reports.report.export',
  'ai.assistant.use', 'tools.use',
  'admin.org', 'admin.users', 'admin.subscription', 'admin.audit', 'admin.integrations',
];

const BASE: Permission[] = ['itsm.ticket.create', 'itsm.ticket.view.own', 'assets.asset.view', 'docs.content.view', 'tools.use', 'ai.assistant.use'];

/** Role → granted permissions. Deliberately explicit; the README matrix is the source. */
export const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  org_owner: EVERYTHING,
  org_admin: EVERYTHING.filter(p => p !== 'finance.budget.manage'),
  it_manager: [
    ...BASE, 'itsm.ticket.view.all', 'itsm.ticket.assign', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.create', 'assets.asset.update', 'assets.asset.transfer', 'assets.asset.dispose',
    'maintenance.workorder.manage', 'maintenance.plan.manage',
    'infrastructure.device.manage', 'infrastructure.alert.manage',
    'projects.project.manage', 'clients.client.view',
    'procurement.po.view', 'procurement.po.create', 'procurement.po.approve', 'procurement.vendor.manage', 'procurement.stock.manage',
    'finance.invoice.view', 'reports.report.view', 'reports.report.export',
    'compliance.item.view', 'docs.content.manage', 'admin.users', 'admin.integrations', 'infrastructure.device.view',
  ],
  it_technician: [
    ...BASE, 'itsm.ticket.view.team', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.create', 'assets.asset.update',
    'maintenance.workorder.manage', 'infrastructure.device.view', 'infrastructure.alert.manage',
    'projects.project.view', 'procurement.po.view', 'reports.report.view', 'docs.content.manage',
  ],
  network_engineer: [
    ...BASE, 'itsm.ticket.view.team', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.update', 'infrastructure.device.manage', 'infrastructure.alert.manage',
    'maintenance.workorder.view', 'reports.report.view', 'docs.content.manage', 'projects.project.view',
  ],
  security_officer: [
    ...BASE, 'itsm.ticket.view.team', 'assets.asset.view', 'infrastructure.device.view',
    'compliance.item.view', 'compliance.item.manage', 'reports.report.view', 'reports.report.export', 'docs.content.manage', 'admin.audit',
  ],
  procurement_officer: [
    ...BASE, 'assets.asset.view', 'procurement.vendor.manage', 'procurement.po.view', 'procurement.po.create',
    'procurement.po.approve', 'procurement.stock.manage', 'reports.report.view',
  ],
  finance_officer: [
    ...BASE, 'finance.invoice.view', 'finance.invoice.manage', 'finance.expense.manage', 'finance.budget.manage',
    'procurement.po.view', 'reports.report.view', 'reports.report.export',
  ],
  dept_manager: [
    ...BASE, 'itsm.ticket.view.team', 'procurement.po.create', 'procurement.po.approve', 'reports.report.view',
  ],
  employee: [...BASE],
  auditor: [
    'itsm.ticket.view.all', 'assets.asset.view', 'maintenance.workorder.view', 'infrastructure.device.view',
    'projects.project.view', 'procurement.po.view', 'finance.invoice.view', 'docs.content.view',
    'compliance.item.view', 'reports.report.view', 'reports.report.export', 'admin.audit', 'tools.use',
    'itsm.ticket.create', 'itsm.ticket.view.own',
  ],
  // ── Service provider roles (operate across client tenants via delegation) ──
  svc_delivery_manager: [
    ...BASE, 'itsm.ticket.view.all', 'itsm.ticket.assign', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.create', 'assets.asset.update', 'assets.asset.transfer',
    'maintenance.workorder.manage', 'maintenance.plan.manage', 'infrastructure.device.manage', 'infrastructure.alert.manage',
    'projects.project.manage', 'clients.client.view', 'clients.client.manage',
    'procurement.po.view', 'procurement.po.create', 'procurement.po.approve', 'procurement.vendor.manage',
    'finance.invoice.view', 'finance.invoice.manage', 'compliance.item.view', 'compliance.item.manage',
    'reports.report.view', 'reports.report.export', 'docs.content.manage', 'admin.users',
  ],
  account_manager: [
    ...BASE, 'itsm.ticket.view.all', 'clients.client.view', 'clients.client.manage',
    'finance.invoice.view', 'finance.invoice.manage', 'reports.report.view', 'reports.report.export',
    'projects.project.view', 'compliance.item.view',
  ],
  support_lead: [
    ...BASE, 'itsm.ticket.view.all', 'itsm.ticket.assign', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.view', 'maintenance.workorder.manage', 'infrastructure.device.view', 'infrastructure.alert.manage',
    'reports.report.view', 'docs.content.manage', 'clients.client.view',
  ],
  field_technician: [
    ...BASE, 'itsm.ticket.view.team', 'itsm.ticket.update', 'itsm.ticket.close',
    'assets.asset.view', 'assets.asset.update', 'maintenance.workorder.manage',
    'infrastructure.device.view', 'infrastructure.alert.manage', 'projects.project.view', 'docs.content.view', 'clients.client.view',
  ],
  project_manager: [
    ...BASE, 'itsm.ticket.view.team', 'projects.project.manage', 'clients.client.view',
    'procurement.po.view', 'procurement.po.create', 'reports.report.view', 'docs.content.manage',
  ],
};

export function permissionsForRole(role: RoleId): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export interface AccessContext {
  userId: ID;
  tenantId: ID; // the tenant whose data is being accessed
  role: RoleId;
  /** true when the user reached this tenant through a provider client relationship */
  delegated: boolean;
  branchId?: ID;
  departmentId?: ID;
  /** Explicit client-approved grant; only used for delegated access. */
  grantedPermissions?: readonly Permission[];
  delegationExpiresAt?: string;
}

/** Client administration, billing and tenant ownership are never delegated. */
export const DELEGATABLE_PERMISSIONS: readonly Permission[] = EVERYTHING.filter(p =>
  !p.startsWith('admin.') && !p.startsWith('clients.') && !p.startsWith('finance.') &&
  !p.endsWith('.create') && !p.endsWith('.approve') && !p.endsWith('.dispose') && p !== 'ai.assistant.use');

export function can(ctx: AccessContext, perm: Permission, nowMs = Date.now()): boolean {
  if (ctx.delegated) {
    if (!ctx.grantedPermissions || (ctx.delegationExpiresAt && Date.parse(ctx.delegationExpiresAt) <= nowMs)) return false;
    return DELEGATABLE_PERMISSIONS.includes(perm) && ctx.grantedPermissions.includes(perm) && permissionsForRole(ctx.role).has(perm);
  }
  return permissionsForRole(ctx.role).has(perm);
}

/** Ticket visibility scope for list/detail queries (README §6.4 scopes). */
export type TicketScope = 'all' | 'team' | 'own' | 'none';
export function ticketScope(ctx: AccessContext): TicketScope {
  if (can(ctx, 'itsm.ticket.view.all')) return 'all';
  if (can(ctx, 'itsm.ticket.view.team')) return 'team';
  if (can(ctx, 'itsm.ticket.view.own')) return 'own';
  return 'none';
}

/** Resolve the user's membership inside an explicit tenant. */
export function membershipIn(memberships: Membership[], userId: ID, tenantId: ID): Membership | undefined {
  return memberships.find(m => m.userId === userId && m.tenantId === tenantId && m.status === 'active');
}

/**
 * Builds the effective access context for a user against a tenant,
 * honouring provider delegation: provider staff may act inside a client
 * tenant (delegated=true) because the client relationship grants it, with
 * the same role-based permissions evaluated against that role.
 */
export function accessContextFor(
  memberships: Membership[], userId: ID, tenantId: ID,
  tenantProviderId: ID | undefined,
  delegations: import('./types').Delegation[] = [],
  nowMs = Date.now(),
): AccessContext | null {
  const direct = membershipIn(memberships, userId, tenantId);
  if (direct) return { userId, tenantId, role: direct.role, delegated: false, branchId: direct.branchId, departmentId: direct.departmentId };
  if (tenantProviderId) {
    const viaProvider = membershipIn(memberships, userId, tenantProviderId);
    const grant = delegations.find(g => g.tenantId === tenantId && g.providerId === tenantProviderId &&
      g.userId === userId && g.status === 'active' && Date.parse(g.expiresAt) > nowMs);
    if (viaProvider && grant) return {
      userId, tenantId, role: viaProvider.role, delegated: true,
      grantedPermissions: grant.permissions.filter(p => DELEGATABLE_PERMISSIONS.includes(p)),
      delegationExpiresAt: grant.expiresAt,
    };
  }
  return null;
}

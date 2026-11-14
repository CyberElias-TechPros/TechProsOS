/** Navigation model — module registry with permission gates (permission-aware nav per README). */
import type { Permission } from '../platform/permissions';
import type { IconName } from '../components/icons';

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  requires: Permission;        // nav visibility gate (data layer still enforces)
  /** dynamic badge hook name resolved in the shell */
  badge?: 'openTickets' | 'alerts' | 'overdueInvoices' | 'lowStock';
}

export interface NavGroup { group: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    group: 'Operate',
    items: [
      { path: '/app/overview', label: 'Overview', icon: 'overview', requires: 'itsm.ticket.view.own' },
      { path: '/app/service-desk', label: 'Service Desk', icon: 'tickets', requires: 'itsm.ticket.view.own', badge: 'openTickets' },
      { path: '/app/assets', label: 'Assets & Inventory', icon: 'assets', requires: 'assets.asset.view' },
      { path: '/app/maintenance', label: 'Maintenance', icon: 'maintenance', requires: 'maintenance.workorder.view' },
      { path: '/app/monitoring', label: 'Monitoring (NOC)', icon: 'infra', requires: 'infrastructure.device.view', badge: 'alerts' },
    ],
  },
  {
    group: 'Deliver',
    items: [
      { path: '/app/projects', label: 'Projects', icon: 'projects', requires: 'projects.project.view' },
      { path: '/app/clients', label: 'Clients', icon: 'clients', requires: 'clients.client.view' },
      { path: '/app/docs', label: 'Docs & Knowledge', icon: 'docs', requires: 'docs.content.view' },
    ],
  },
  {
    group: 'Govern',
    items: [
      { path: '/app/compliance', label: 'Audit & Compliance', icon: 'compliance', requires: 'compliance.item.view' },
      { path: '/app/procurement', label: 'Procurement', icon: 'procurement', requires: 'procurement.po.view', badge: 'lowStock' },
      { path: '/app/finance', label: 'Finance & Costs', icon: 'finance', requires: 'finance.invoice.view', badge: 'overdueInvoices' },
      { path: '/app/reports', label: 'Reports & Analytics', icon: 'reports', requires: 'reports.report.view' },
    ],
  },
  {
    group: 'Work smarter',
    items: [
      { path: '/app/assistant', label: 'AI Assistant', icon: 'ai', requires: 'ai.assistant.use' },
      { path: '/app/tools', label: 'IT Tools', icon: 'tools', requires: 'tools.use' },
    ],
  },
  {
    group: 'Administer',
    items: [
      { path: '/app/admin', label: 'Administration', icon: 'settings', requires: 'admin.org' },
      { path: '/app/admin/audit', label: 'Audit Trail', icon: 'history', requires: 'admin.audit' },
    ],
  },
];

/** Flatten nav minus groups */
export const ALL_NAV: NavItem[] = NAV.flatMap(g => g.items);

export type WorkspaceKind = 'org' | 'provider';

/** Provider workspaces emphasise client-facing modules; orgs see internal ops first. */
export function navFor(kind: WorkspaceKind): NavGroup[] {
  if (kind === 'provider') return NAV;
  return NAV.filter(g => !(g.group === 'Deliver')) .concat([
    { group: 'Deliver', items: NAV.find(g => g.group === 'Deliver')!.items.filter(i => i.path !== '/app/clients') },
  ]);
}

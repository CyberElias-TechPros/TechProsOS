/**
 * Permission-scoped global search.
 *
 * The palette previously indexed only tickets/assets/devices, read `data.tickets` directly
 * (bypassing ticket visibility scope), and used `slice(-60)` on a newest-first array — so it
 * indexed the *oldest* sixty tickets while presenting itself as search.
 *
 * Finding a record by name is a read, so this uses exactly the same scoping as the list screens:
 * `visibleTickets` for the ticket scope rules and the matching `can()` permission for each module.
 * Nothing here widens access; a record the user cannot open is never offered as a result.
 */
import type { DataSet } from './types';
import { can, type AccessContext } from './permissions';
import { visibleTickets } from './metrics';
import type { IconName } from '../components/icons';

export interface SearchRecord {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  to: string;
  icon: IconName;
}

/** Cap keeps the palette responsive and the list scannable. */
export const SEARCH_LIMIT = 20;

export function buildSearchIndex(d: DataSet, ctx: AccessContext): SearchRecord[] {
  const t = ctx.tenantId;
  const out: SearchRecord[] = [];
  const add = (rows: { id: string; tenantId: string }[], allowed: boolean, map: (r: never) => SearchRecord) => {
    if (!allowed) return;
    for (const r of rows) if (r.tenantId === t) out.push(map(r as never));
  };

  // Tickets use the visibility projection, not a bare tenant filter: an employee must not
  // discover colleagues' tickets through search any more than through the queue.
  if (can(ctx, 'itsm.ticket.view.own')) {
    for (const tk of visibleTickets(d, ctx)) {
      out.push({ id: tk.id, kind: 'Ticket', title: tk.title, subtitle: tk.number, to: `/app/service-desk/${tk.id}`, icon: 'tickets' });
    }
  }

  add(d.assets, can(ctx, 'assets.asset.view'), (a: { id: string; name: string; tag: string }) =>
    ({ id: a.id, kind: 'Asset', title: a.name, subtitle: a.tag, to: `/app/assets/${a.id}`, icon: 'assets' }));
  add(d.projects, can(ctx, 'projects.project.view'), (p: { id: string; name: string; code?: string }) =>
    ({ id: p.id, kind: 'Project', title: p.name, subtitle: p.code ?? 'Project', to: `/app/projects/${p.id}`, icon: 'projects' }));
  add(d.documents, can(ctx, 'docs.content.view'), (doc: { id: string; title: string; kind: string }) =>
    ({ id: doc.id, kind: 'Document', title: doc.title, subtitle: doc.kind, to: '/app/docs', icon: 'docs' }));
  add(d.articles, can(ctx, 'docs.content.view'), (a: { id: string; title: string; category: string }) =>
    ({ id: a.id, kind: 'Article', title: a.title, subtitle: a.category, to: '/app/docs', icon: 'docs' }));
  add(d.invoices, can(ctx, 'finance.invoice.view'), (i: { id: string; number: string; clientName: string }) =>
    ({ id: i.id, kind: 'Invoice', title: i.clientName, subtitle: i.number, to: '/app/finance', icon: 'finance' }));
  add(d.purchaseOrders, can(ctx, 'procurement.po.view'), (p: { id: string; number: string; note?: string }) =>
    ({ id: p.id, kind: 'Purchase order', title: p.number, subtitle: p.note ?? 'Purchase order', to: '/app/procurement', icon: 'procurement' }));
  add(d.workOrders, can(ctx, 'maintenance.workorder.view'), (w: { id: string; title: string; number?: string }) =>
    ({ id: w.id, kind: 'Work order', title: w.title, subtitle: w.number ?? 'Maintenance', to: '/app/maintenance', icon: 'maintenance' }));
  add(d.devices, can(ctx, 'infrastructure.device.view'), (dev: { id: string; name: string; address?: string }) =>
    ({ id: dev.id, kind: 'Device', title: dev.name, subtitle: dev.address ?? 'Monitored device', to: `/app/monitoring?device=${dev.id}`, icon: 'infra' }));
  add(d.vendors, can(ctx, 'procurement.po.view'), (v: { id: string; name: string }) =>
    ({ id: v.id, kind: 'Vendor', title: v.name, subtitle: 'Vendor', to: '/app/procurement', icon: 'procurement' }));
  add(d.risks, can(ctx, 'compliance.item.view'), (r: { id: string; title: string; category: string }) =>
    ({ id: r.id, kind: 'Risk', title: r.title, subtitle: r.category, to: '/app/compliance', icon: 'compliance' }));

  // Provider client workspaces are tenants, not tenant-owned rows.
  if (can(ctx, 'clients.client.view')) {
    for (const c of d.tenants) if (c.providerId === t && c.status === 'active') {
      out.push({ id: c.id, kind: 'Client', title: c.name, subtitle: c.city || 'Client workspace', to: `/app/clients/${c.id}`, icon: 'clients' });
    }
  }
  return out;
}

/**
 * Rank by how directly the query matches. Every term must appear somewhere (AND), so
 * "block printer" narrows rather than widens. Prefix matches on the title outrank mid-string
 * and subtitle matches, which keeps the obvious answer at the top.
 */
export function searchRecords(index: SearchRecord[], query: string, limit = SEARCH_LIMIT): SearchRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return index.slice(0, limit);
  const terms = needle.split(/\s+/).filter(Boolean);
  const scored: { record: SearchRecord; score: number }[] = [];
  for (const record of index) {
    const title = record.title.toLowerCase();
    const subtitle = record.subtitle.toLowerCase();
    const haystack = `${title} ${subtitle}`;
    if (!terms.every(term => haystack.includes(term))) continue;
    let score = 0;
    if (title.startsWith(needle)) score += 100;
    if (subtitle.toLowerCase().startsWith(needle)) score += 80;
    for (const term of terms) {
      if (title.startsWith(term)) score += 30;
      else if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) score += 20;
      else if (title.includes(term)) score += 10;
      if (subtitle.includes(term)) score += 6;
    }
    scored.push({ record, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.record);
}

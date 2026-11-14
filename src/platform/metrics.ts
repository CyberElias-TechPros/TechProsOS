/**
 * Metrics & selectors — derived analytics over permitted, tenant-scoped data.
 * Reports and dashboards consume these; they never re-implement aggregation.
 */
import type { AccessContext } from './permissions';
import { ticketScope } from './permissions';
import type { DataSet, Ticket } from './types';
import { businessMinutesBetween, slaState, type WorkCal } from './sla';
import { DAYS, pct } from './util';

/** Tickets the current access context may see (README §6.4 scoping). */
export function visibleTickets(data: DataSet, ctx: AccessContext): Ticket[] {
  const inTenant = data.tickets.filter(t => t.tenantId === ctx.tenantId);
  const scope = ticketScope(ctx);
  if (scope === 'all') return inTenant;
  if (scope === 'team') {
    // Technicians see the operational queue; employees only their own.
    return inTenant.filter(t => t.assigneeId === ctx.userId || t.requesterId === ctx.userId || t.status === 'new' || t.status === 'triaged');
  }
  if (scope === 'own') return inTenant.filter(t => t.requesterId === ctx.userId || t.assigneeId === ctx.userId);
  return [];
}

export interface ItsmStats {
  open: number; criticalOpen: number; resolvedThisMonth: number;
  avgFirstResponseMin: number | null; avgResolveMin: number | null;
  slaResponseCompliance: number | null; slaResolveCompliance: number | null;
  csat: number | null; byCategory: { name: string; count: number }[];
  byPriority: { name: string; count: number }[];
  weekly: { week: string; opened: number; closed: number }[];
}

export function itsmStats(tickets: Ticket[], nowMs = Date.now()): ItsmStats {
  const open = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved');
  const closedOrResolved = tickets.filter(t => t.resolvedAt);
  const monthAgo = nowMs - 30 * DAYS;

  const responseTimes = closedOrResolved.filter(t => t.firstResponseAt).map(t => (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / 60000);
  const resolveTimes = closedOrResolved.map(t => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  const responded = tickets.filter(t => t.firstResponseAt && t.responseDueAt);
  const responseMet = responded.filter(t => new Date(t.firstResponseAt!).getTime() <= new Date(t.responseDueAt!).getTime()).length;
  const resolvedWithSla = tickets.filter(t => t.resolvedAt && t.resolveDueAt);
  const resolveMet = resolvedWithSla.filter(t => new Date(t.resolvedAt!).getTime() <= new Date(t.resolveDueAt!).getTime()).length;

  const rated = tickets.filter(t => t.csat);
  const cat = new Map<string, number>();
  const pri = new Map<string, number>();
  for (const t of tickets) {
    cat.set(t.category, (cat.get(t.category) ?? 0) + 1);
    pri.set(t.priority, (pri.get(t.priority) ?? 0) + 1);
  }
  const weeks = new Map<string, { opened: number; closed: number }>();
  for (let w = 7; w >= 0; w--) {
    const start = nowMs - (w + 1) * 7 * DAYS;
    const label = new Date(start).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
    weeks.set(label, { opened: 0, closed: 0 });
  }
  for (const t of tickets) {
    const created = new Date(t.createdAt).getTime();
    const wIdx = Math.floor((nowMs - created) / (7 * DAYS));
    if (wIdx >= 0 && wIdx < 8) {
      const start = nowMs - (wIdx + 1) * 7 * DAYS;
      const label = new Date(start).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
      const entry = weeks.get(label);
      if (entry) entry.opened += 1;
    }
    if (t.closedAt) {
      const c = new Date(t.closedAt).getTime();
      const wIdx = Math.floor((nowMs - c) / (7 * DAYS));
      if (wIdx >= 0 && wIdx < 8) {
        const start = nowMs - (wIdx + 1) * 7 * DAYS;
        const label = new Date(start).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
        const entry = weeks.get(label);
        if (entry) entry.closed += 1;
      }
    }
  }

  return {
    open: open.length,
    criticalOpen: open.filter(t => t.priority === 'critical').length,
    resolvedThisMonth: closedOrResolved.filter(t => new Date(t.resolvedAt!).getTime() > monthAgo).length,
    avgFirstResponseMin: avg(responseTimes),
    avgResolveMin: avg(resolveTimes),
    slaResponseCompliance: responded.length ? pct(responseMet, responded.length) : null,
    slaResolveCompliance: resolvedWithSla.length ? pct(resolveMet, resolvedWithSla.length) : null,
    csat: rated.length ? Math.round((rated.reduce((a, t) => a + (t.csat ?? 0), 0) / rated.length) * 10) / 10 : null,
    byCategory: [...cat.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byPriority: [...pri.entries()].map(([name, count]) => ({ name, count })),
    weekly: [...weeks.entries()].map(([week, v]) => ({ week, ...v })),
  };
}

/** SLA compliance over business minutes for a set of tickets. */
export function slaCompliance(tickets: Ticket[], cal: WorkCal): { within: number; total: number; compliance: number | null } {
  const measured = tickets.filter(t => t.resolvedAt && t.resolveDueAt);
  const within = measured.filter(t => businessMinutesBetween(t.createdAt, t.resolvedAt!, cal) <= businessMinutesBetween(t.createdAt, t.resolveDueAt!, cal)).length;
  return { within, total: measured.length, compliance: measured.length ? pct(within, measured.length) : null };
}

export function fleetHealth(devices: DataSet['devices']): { up: number; degraded: number; down: number; availabilityPct: number | null } {
  const up = devices.filter(d => d.status === 'up').length;
  const degraded = devices.filter(d => d.status === 'degraded').length;
  const down = devices.filter(d => d.status === 'down').length;
  const total = devices.length;
  return { up, degraded, down, availabilityPct: total ? Math.round(((up + degraded * 0.5) / total) * 1000) / 10 : null };
}

export function riskScore(r: { likelihood: number; impact: number }): number { return r.likelihood * r.impact; }
export function riskBand(score: number): 'low' | 'medium' | 'high' | 'critical' {
  return score >= 17 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low';
}

export function slaBadgeState(t: Ticket, nowMs = Date.now()): ReturnType<typeof slaState> {
  return slaState(t.resolveDueAt, t.resolvedAt ?? t.closedAt, nowMs);
}

/** Overdue receivables for a tenant (sent past due date, or status overdue). */
export function overdueInvoices(data: DataSet, tenantId: string): { count: number; overdueAmount: number } {
  const now = Date.now();
  const list = data.invoices.filter(i => i.tenantId === tenantId && ((i.status === 'sent' && new Date(i.dueAt).getTime() < now) || i.status === 'overdue'));
  return { count: list.length, overdueAmount: list.reduce((a, i) => a + invoiceNet(i), 0) };
}

/** Net receivable for an invoice: subtotal + VAT − WHT. */
export function invoiceNet(i: { items: { qty: number; unitPrice: number }[]; vatRate: number; whtRate: number }): number {
  const subtotal = i.items.reduce((a, x) => a + x.qty * x.unitPrice, 0);
  return Math.round(subtotal * (1 + i.vatRate) - subtotal * i.whtRate);
}

/** Service agreements renewing within N days (provider workspace radar). */
export function expiringAgreements(data: { agreements: { id: string; tenantId: string; clientTenantId: string; name: string; renewsAt: string; status: string; monthlyFee: number }[] }, tenantId: string, withinDays: number) {
  const now = Date.now();
  const limit = now + withinDays * DAYS;
  return data.agreements
    .filter(a => a.tenantId === tenantId && a.status !== 'expired')
    .map(a => ({ ...a, daysLeft: Math.round((new Date(a.renewsAt).getTime() - now) / DAYS) }))
    .filter(a => new Date(a.renewsAt).getTime() <= limit)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Average normalised risk exposure for an open risk register (0..100). */
export function riskExposure(risks: { likelihood: number; impact: number }[]): number {
  if (!risks.length) return 0;
  const avg = risks.reduce((a, r) => a + r.likelihood * r.impact, 0) / risks.length;
  return Math.round((avg / 25) * 100);
}

/** Work calendar from the tenant's default SLA policy. */
export function workCalFor(data: DataSet, tenantId: string): WorkCal {
  const p = data.slaPolicies.find(x => x.tenantId === tenantId);
  return p ? { workStartHour: p.workStartHour, workEndHour: p.workEndHour, workDays: p.workDays, holidays: p.holidays }
    : { workStartHour: 8, workEndHour: 18, workDays: [1, 2, 3, 4, 5], holidays: [] };
}

/** Expense spend grouped by category, descending. */
export function spendByCategory(expenses: { category: string; amount: number }[]): { category: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

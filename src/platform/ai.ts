/**
 * The TechPros assistant — an on-platform intelligence layer.
 * Every answer is computed from records the *current access context* is
 * allowed to see; nothing crosses tenant or permission boundaries, and the
 * assistant never performs consequential actions on its own.
 * In production this gateway routes to an LLM with the same data contracts;
 * here it runs deterministic analytics over the workspace so every answer
 * stays verifiably grounded in the user's own data.
 */
import type { AccessContext } from './permissions';
import { can } from './permissions';
import { itsmStats, visibleTickets, fleetHealth, riskScore, riskBand } from './metrics';
import type { DataSet } from './types';
import { fmtDate, fmtTimeAgo, ngn, pct } from './util';
import { depreciatedValue } from './db';

export interface AssistantReply {
  text: string;
  /** Optional structured table payload rendered by the chat UI. */
  rows?: { label: string; value: string; hint?: string }[];
  links?: { label: string; to: string }[];
  basis: string; // what data the answer used — stated for trust
}

function hasAnswers(q: string, ...words: string[]): boolean {
  const s = q.toLowerCase();
  return words.some(w => s.includes(w));
}

export function askAssistant(data: DataSet, ctx: AccessContext, question: string): AssistantReply {
  const q = question.toLowerCase();
  const tickets = visibleTickets(data, ctx);
  const stats = itsmStats(tickets);
  const tenant = data.tenants.find(t => t.id === ctx.tenantId);
  const scopeNote = ctx.delegated ? 'client workspace records (delegated access)' : 'your workspace records';

  if (hasAnswers(q, 'common', 'frequent', 'recurring', 'most', 'top') && hasAnswers(q, 'problem', 'issue', 'ticket', 'incident')) {
    const top = stats.byCategory.slice(0, 5);
    return {
      text: `Across ${tickets.length} tickets in ${scopeNote}, these categories recur most:`,
      rows: top.map(c => ({ label: c.name, value: `${c.count} tickets`, hint: `${pct(c.count, tickets.length)}% of volume` })),
      links: [{ label: 'Open service desk', to: '/app/service-desk' }, { label: 'Full breakdown in reports', to: '/app/reports' }],
      basis: `${tickets.length} tickets visible to your role, all time`,
    };
  }

  if (hasAnswers(q, 'sla', 'compliance', 'response time', 'resolution time')) {
    const resp = stats.slaResponseCompliance == null ? 'not enough data' : `${stats.slaResponseCompliance}%`;
    return {
      text: `First-response targets are being met ${resp} of the time${stats.avgFirstResponseMin != null ? `, with a mean first response of ${Math.round(stats.avgFirstResponseMin)} minutes` : ''}. ${stats.criticalOpen} critical ticket${stats.criticalOpen === 1 ? '' : 's'} remain open right now.`,
      rows: [
        { label: 'Response SLA compliance', value: resp },
        { label: 'Resolution SLA compliance', value: stats.slaResolveCompliance == null ? '—' : `${stats.slaResolveCompliance}%` },
        { label: 'Mean time to resolve', value: stats.avgResolveMin != null ? `${Math.round(stats.avgResolveMin / 60)}h` : '—' },
        { label: 'Customer satisfaction', value: stats.csat != null ? `${stats.csat} / 5` : '—' },
      ],
      links: [{ label: 'SLA report', to: '/app/reports' }],
      basis: `${tickets.length} tickets visible to your role`,
    };
  }

  if (hasAnswers(q, 'warranty', 'warranties', 'expiring')) {
    const soon = data.assets.filter(a => a.tenantId === ctx.tenantId && a.warrantyExpiry && new Date(a.warrantyExpiry).getTime() - Date.now() < 90 * 86400000);
    return {
      text: soon.length
        ? `I found ${soon.length} asset${soon.length === 1 ? '' : 's'} with warranty expiring within 90 days (or already expired). Acting before expiry usually saves 30–60% on repairs.`
        : 'No warranties expire within the next 90 days — the register is in good shape.',
      rows: soon.slice(0, 6).map(a => ({ label: `${a.tag} · ${a.name}`, value: a.warrantyExpiry ? fmtDate(a.warrantyExpiry) : '—', hint: a.assigneeId ? 'assigned' : 'pooled' })),
      links: [{ label: 'Open asset register', to: '/app/assets' }],
      basis: `${data.assets.filter(a => a.tenantId === ctx.tenantId).length} registered assets`,
    };
  }

  if (hasAnswers(q, 'spend', 'spending', 'cost', 'expense', 'budget', 'money')) {
    if (!can(ctx, 'reports.report.view')) return { text: 'You do not have permission to view expenditure analytics. Ask an administrator for the finance summary.', basis: 'permission check' };
    const exp = data.expenses.filter(e => e.tenantId === ctx.tenantId);
    const total = exp.reduce((a, e) => a + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of exp) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    return {
      text: `Recorded operational IT spend across this workspace is ${ngn(total)} so far, split across ${byCat.size} categories:`,
      rows: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, value: ngn(v) })),
      links: [{ label: 'Expenditure report', to: '/app/reports' }, { label: 'Finance module', to: '/app/finance' }],
      basis: `${exp.length} expense records`,
    };
  }

  if (hasAnswers(q, 'summar', 'draft', 'report', 'monthly')) {
    const assets = data.assets.filter(a => a.tenantId === ctx.tenantId);
    const value = assets.reduce((a, x) => a + depreciatedValue(x), 0);
    const fleet = fleetHealth(data.devices.filter(d => d.tenantId === ctx.tenantId));
    return {
      text: `Here is a draftsman's summary for ${tenant?.name ?? 'this workspace'} this period: ${stats.resolvedThisMonth} tickets resolved (30d), ${stats.open} still open, ${stats.criticalOpen} critical. The asset register holds ${assets.length} items with a current estimated book value of ${ngn(value)}. Monitored infrastructure availability stands at ${fleet.availabilityPct ?? '—'}% (${fleet.down} device${fleet.down === 1 ? '' : 's'} down). Open the report builder to render this as a management document.`,
      links: [{ label: 'Generate monthly report', to: '/app/reports' }],
      basis: 'tickets, assets and monitored devices visible to your role',
    };
  }

  if (hasAnswers(q, 'risk', 'risks', 'compliance', 'audit')) {
    const risks = data.risks.filter(r => r.tenantId === ctx.tenantId && (r.status === 'open' || r.status === 'mitigating'));
    const topRisks = [...risks].sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5);
    return {
      text: risks.length
        ? `${risks.length} risk${risks.length === 1 ? '' : 's'} are currently open or being mitigated. The highest-rated entries:`
        : 'The risk register has no open entries — a good position to be in. Keep reviews scheduled.',
      rows: topRisks.map(r => ({ label: r.title, value: `L${r.likelihood} × I${r.impact} = ${riskScore(r)} (${riskBand(riskScore(r))})` })),
      links: [{ label: 'Open risk register', to: '/app/compliance' }],
      basis: `${risks.length} open/mitigating risks`,
    };
  }

  if (hasAnswers(q, 'device', 'network', 'infrastructure', 'offline', 'down', 'status')) {
    const devices = data.devices.filter(d => d.tenantId === ctx.tenantId);
    const fleet = fleetHealth(devices);
    const problem = devices.filter(d => d.status !== 'up');
    return {
      text: `Of ${devices.length} monitored devices, ${fleet.up} are healthy, ${fleet.degraded} degraded and ${fleet.down} down — availability ≈ ${fleet.availabilityPct ?? 0}%.`,
      rows: problem.map(d => ({ label: d.name, value: d.status, hint: `last seen ${fmtTimeAgo(d.lastSeenAt)}` })),
      links: [{ label: 'Open network operations', to: '/app/infrastructure' }],
      basis: `${devices.length} monitored devices`,
    };
  }

  if (hasAnswers(q, 'hello', 'hi ', 'help', 'what can you')) {
    return {
      text: 'I answer from your workspace data — service desk, assets, infrastructure, spend, risks and reports. Try: “What were our most common IT problems this month?”, “Which warranties expire soon?”, “Draft a monthly summary”, or “Show me open risks.” I only see records your role permits, and I never take action without you.',
      basis: 'capability help',
    };
  }

  return {
    text: 'I could not tie that to records you can access. I can analyse tickets, assets, infrastructure, spend, projects and risks, and draft monthly summaries. Try asking about common problems, SLA compliance, warranty expiries or spend.',
    links: [{ label: 'Browse the knowledge base', to: '/app/docs' }],
    basis: 'no matching analysis for this phrasing',
  };
}

/** Suggest knowledge-base articles for a ticket being drafted (title + description signals). */
export function suggestArticles(data: DataSet, tenantId: string, text: string): DataSet['articles'] {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
  const scored = data.articles
    .filter(a => a.tenantId === tenantId && a.status === 'published')
    .map(a => {
      const hay = `${a.title} ${a.tags.join(' ')} ${a.category}`.toLowerCase();
      return { a, score: words.filter(w => hay.includes(w)).length };
    })
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, 3).map(x => x.a);
}

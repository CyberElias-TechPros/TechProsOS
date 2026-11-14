/** Reports — curated executive reports + recent runs. PDF export via print-friendly sheets. */
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart } from 'recharts';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { itsmStats, slaCompliance, workCalFor, spendByCategory } from '../../platform/metrics';
import { recordReportRun } from '../../platform/actions';
import { depreciatedValue } from '../../platform/db';
import { PageHead, Table, toast } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { fmtDuration, fmtTimeAgo, ngn, pct } from '../../platform/util';
import { branchName, userName } from './lookups';
import { visibleTickets, fleetHealth } from '../../platform/metrics';

interface ReportDef { id: string; icon: IconName; title: string; blurb: string }
const REPORTS: ReportDef[] = [
  { id: 'exec', icon: 'gauge', title: 'Executive summary', blurb: 'One page: service health, spend, risk — the CEO view.' },
  { id: 'itsm', icon: 'tickets', title: 'Service desk performance', blurb: 'Volumes, SLAs, categories, CSAT for the review meeting.' },
  { id: 'assets', icon: 'assets', title: 'Asset register & depreciation', blurb: 'Full register with book values per branch.' },
  { id: 'finance', icon: 'finance', title: 'Spend & cost centres', blurb: 'Expenses by category, receivables outstanding.' },
];

export default function Reports() {
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const [running, setRunning] = useState<string | null>(null);

  const tickets = useMemo(() => visibleTickets(data, ctx), [data, ctx]);
  const stats = useMemo(() => itsmStats(tickets), [tickets]);
  const runs = data.reportRuns.filter(r => r.tenantId === ctx.tenantId);

  const run = async (r: ReportDef) => {
    await recordReportRun(ctx, r.id, r.title, { period: 'last-30d' });
    setRunning(r.id);
    toast(`“${r.title}” generated — use Print → Save as PDF`, 'info');
  };

  const reportDef = REPORTS.find(r => r.id === running);

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Reports']} title="Reports & analytics"
        sub="Board-ready, print-friendly outputs. Numbers below are derived live from your current workspace." />

      <div className="grid-4 no-print">
        {REPORTS.map(r => (
          <button key={r.id} className="card pad-lg stack" style={{ textAlign: 'left', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }} onClick={() => run(r)}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
              <Icon name={r.icon} size={19} />
            </span>
            <b>{r.title}</b>
            <span className="xs muted" style={{ lineHeight: 1.5 }}>{r.blurb}</span>
            <span className="sm b" style={{ color: 'var(--accent)' }}>Generate →</span>
          </button>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="card pad-lg stack no-print">
          <h3>Recent report runs</h3>
          <Table head={['Report', 'Run by', 'Parameters', 'When']}>
            {runs.slice(0, 8).map(r => (
              <tr key={r.id}>
                <td className="b sm">{r.title}</td>
                <td className="sm">{userName(data, r.runBy)}</td>
                <td className="sm mono xs">{Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(' · ')}</td>
                <td className="xs muted">{fmtTimeAgo(r.at)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {running && reportDef ? (
        <ReportSheet def={reportDef} onClose={() => setRunning(null)} />
      ) : (
        <div className="grid-2 no-print">
          <div className="card pad-lg stack">
            <h3>Ticket volume vs resolution</h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={stats.weekly} margin={{ left: -24, right: 4, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar name="Opened" dataKey="opened" fill="#1d63ed" radius={[4, 4, 0, 0]} />
                  <Line name="Resolved" type="monotone" dataKey="closed" stroke="#0d9263" strokeWidth={2.4} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card pad-lg stack">
            <h3>Category mix</h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={stats.byCategory} dataKey="count" nameKey="name" outerRadius={86} paddingAngle={2} label={({ name }) => name} labelLine={false} fontSize={10.5}>
                    {stats.byCategory.map((_, i) => <Cell key={i} fill={['#1d63ed', '#0ea5e9', '#6d5bd0', '#0d9263', '#e8a13c', '#c93a2b', '#0e7490'][i % 7]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportSheet({ def, onClose }: { def: ReportDef; onClose: () => void }) {
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const tickets = visibleTickets(data, ctx);
  const stats = itsmStats(tickets);
  const sla = slaCompliance(tickets, workCalFor(data, ctx.tenantId));
  const devices = data.devices.filter(d => d.tenantId === ctx.tenantId);
  const health = fleetHealth(devices.filter(d => d.monitored));
  const invoices = data.invoices.filter(i => i.tenantId === ctx.tenantId);
  const expenses = data.expenses.filter(e => e.tenantId === ctx.tenantId);
  const risks = data.risks.filter(r => r.tenantId === ctx.tenantId && r.status !== 'closed');
  const assets = data.assets.filter(a => a.tenantId === ctx.tenantId);
  const spend = spendByCategory(expenses);
  const branches = [...new Set(assets.map(a => a.branchId))];

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide print-sheet" style={{ maxWidth: 820, padding: 0 }}>
        <div className="row between no-print" style={{ padding: '13px 18px', borderBottom: '1px solid var(--line)' }}>
          <b className="sm">Report preview — {def.title}</b>
          <div className="row">
            <button className="btn sm" onClick={() => window.print()}><Icon name="printer" size={13} /> Print / save as PDF</button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        </div>
        <div style={{ padding: 34 }}>
          <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
            <div>
              <div className="xs b" style={{ letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>{tenant.name}</div>
              <h1 style={{ fontSize: 22 }}>{def.title}</h1>
            </div>
            <div className="xs muted" style={{ textAlign: 'right' }}>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}<br />Period: last 30 days · Confidential</div>
          </div>
          <hr className="divider" />

          {(def.id === 'exec' || def.id === 'itsm') && (
            <>
              <h2>Service desk</h2>
              <div className="grid-4" style={{ gap: 10, margin: '10px 0' }}>
                {[
                  ['Open tickets', String(stats.open)],
                  ['Critical open', String(stats.criticalOpen)],
                  ['SLA compliance', sla.compliance == null ? '—' : `${sla.compliance}%`],
                  ['CSAT', stats.csat == null ? '—' : `${stats.csat}/5`],
                ].map(([l, v]) => (
                  <div key={l} className="card flat card-tight"><div className="xs muted">{l}</div><div className="b" style={{ fontSize: 20 }}>{v}</div></div>
                ))}
              </div>
              <p className="sm">Volume: {tickets.length} tickets under management. Average first response {stats.avgFirstResponseMin != null ? fmtDuration(stats.avgFirstResponseMin * 60000) : 'n/a'}; average resolution {stats.avgResolveMin != null ? fmtDuration(stats.avgResolveMin * 60000) : 'n/a'}.</p>
              <Table head={['Category', 'Tickets', 'Share']}>
                {stats.byCategory.map(c => <tr key={c.name}><td className="sm">{c.name}</td><td className="num">{c.count}</td><td className="num">{pct(c.count, tickets.length)}%</td></tr>)}
              </Table>
            </>
          )}

          {def.id === 'exec' && (
            <>
              <h2>Infrastructure & risk</h2>
              <p className="sm">Monitored fleet availability {health.availabilityPct ?? '—'}% across {devices.length} devices ({health.down} down). Open risk entries: {risks.length}.</p>
              <h2>Financial exposure</h2>
              <p className="sm">Outstanding receivables: {ngn(invoices.filter(i => i.status !== 'paid').reduce((a, i) => a + (i.items.reduce((s2, x) => s2 + x.qty * x.unitPrice, 0)) * 1.075, 0), { compact: true })}. Recorded expenses: {ngn(expenses.reduce((a, e) => a + e.amount, 0), { compact: true })}. Asset book value: {ngn(assets.reduce((a, x) => a + depreciatedValue(x), 0), { compact: true })}.</p>
            </>
          )}

          {def.id === 'assets' && (
            <>
              <h2>Register by branch</h2>
              <Table head={['Branch', 'Items', 'Book value']}>
                {branches.map(bid => {
                  const xs = assets.filter(a => a.branchId === bid);
                  return <tr key={bid}><td className="sm">{branchName(data, bid)}</td><td className="num">{xs.length}</td><td className="num">{ngn(xs.reduce((a, x) => a + depreciatedValue(x), 0))}</td></tr>;
                })}
                <tr><td className="b">Total</td><td className="num b">{assets.length}</td><td className="num b">{ngn(assets.reduce((a, x) => a + depreciatedValue(x), 0))}</td></tr>
              </Table>
            </>
          )}

          {def.id === 'finance' && (
            <>
              <h2>Spend by category</h2>
              <Table head={['Category', 'Amount', 'Share']}>
                {spend.map(s => <tr key={s.category}><td className="sm">{s.category}</td><td className="num">{ngn(s.amount)}</td><td className="num">{pct(s.amount, expenses.reduce((a, e) => a + e.amount, 0))}%</td></tr>)}
              </Table>
            </>
          )}

          <p className="xs faint" style={{ marginTop: 22 }}>Report #{def.id.toUpperCase()}-{new Date().toISOString().slice(0, 10)} · TechPros One — figures computed live from workspace data at generation time.</p>
        </div>
      </div>
    </div>
  );
}

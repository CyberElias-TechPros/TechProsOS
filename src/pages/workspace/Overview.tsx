/** Overview — role-aware landing dashboard. Execs see money/risk; staff see the queue. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, PieChart, Pie } from 'recharts';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { itsmStats, slaCompliance, visibleTickets, slaBadgeState, riskExposure, overdueInvoices, expiringAgreements, workCalFor } from '../../platform/metrics';
import { Badge, Empty, PageHead, StatusBadge, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDuration, fmtTimeAgo, pct } from '../../platform/util';
import { acknowledgeAlert, simulateDeviceOutage } from '../../platform/actions';
import { branchName } from './lookups';
import { CountUp } from '../../components/bits/CountUp';
import { Reveal } from '../../app/motion';

const CHART_COLORS = { accent: '#1d63ed', ok: '#0d9263', warn: '#e8a13c', bad: '#c93a2b', info: '#0e7490', violet: '#6d5bd0' };
const CAT_COLORS = ['#1d63ed', '#0ea5e9', '#6d5bd0', '#0d9263', '#e8a13c', '#c93a2b', '#0e7490'];

export default function Overview() {
  const { user, tenant, ctx, can, role } = useSessionCtx();
  const data = useData(s => s.data);
  const t = tenant.id;

  const tickets = useMemo(() => visibleTickets(data, ctx), [data, ctx]);
  const stats = useMemo(() => itsmStats(tickets), [tickets]);
  const sla = useMemo(() => slaCompliance(tickets, workCalFor(data, t)).compliance, [tickets, data, t]);
  const devices = data.devices.filter(d => d.tenantId === t);
  const alerts = data.alerts.filter(a => a.tenantId === t && a.status === 'active');
  const agreements = useMemo(() => expiringAgreements(data, t, 30), [data, t]);
  const inv = useMemo(() => overdueInvoices(data, t), [data, t]);
  const risks = data.risks.filter(r => r.tenantId === t && r.status !== 'closed');
  const rScore = riskExposure(risks);

  const isExec = ['org_owner', 'org_admin', 'it_manager', 'finance_officer'].includes(role);
  const myQueue = tickets.filter(x => x.assigneeId === user.id && x.status !== 'closed' && x.status !== 'resolved');
  const breached = tickets.filter(x => slaBadgeState(x) === 'breached').length;
  const atRisk = tickets.filter(x => slaBadgeState(x) === 'at_risk').length;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="stack-lg">
      <PageHead
        crumbs={[tenant.name, 'Overview']}
        title={`${greet}, ${user.name.split(' ')[0]}`}
        sub={`${devices.filter(d => d.monitored).length} devices monitored · ${tickets.filter(x => !['closed', 'resolved'].includes(x.status)).length} open tickets · ${devices.filter(d => d.status === 'down').length} devices down`}
      />

      {/* KPI strip */}
      <div className="grid-4">
        {[
          { label: 'Open tickets', num: stats.open, to: '/app/service-desk', sub: `${stats.criticalOpen} critical`, tone: stats.criticalOpen ? 'var(--bad)' : undefined },
          { label: 'SLA compliance', num: sla ?? undefined, suffix: '%', to: '/app/reports', sub: `${breached} breached · ${atRisk} at risk`, tone: sla != null && sla < 85 ? 'var(--warn)' : 'var(--ok)' },
          { label: 'Fleet health', num: pct(devices.filter(d => d.status === 'up').length, Math.max(1, devices.filter(d => d.monitored).length)), suffix: '%', to: '/app/monitoring', sub: `${devices.filter(d => d.status !== 'up').length} need attention` },
          isExec
            ? { label: 'Overdue receivables', num: Math.round((inv.overdueAmount || 0) / 1000), prefix: '₦', suffix: 'k', to: '/app/finance', sub: `${inv.count} invoice${inv.count === 1 ? '' : 's'} overdue`, tone: inv.count ? 'var(--bad)' : 'var(--ok)' }
            : { label: 'My queue', num: myQueue.length, to: '/app/service-desk', sub: 'assigned to you' },
        ].map((k, i) => (
          <Reveal key={k.label} delay={i * 0.05} y={14}>
            <Link to={k.to!} className="card kpi overview-kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="k-label">{k.label}</span>
              <span className="k-value" style={k.tone ? { color: k.tone } : undefined}>
                {k.num == null ? '—' : <CountUp to={k.num} prefix={k.prefix ?? ''} suffix={k.suffix ?? ''} triggerOnScroll={false} />}
              </span>
              <span className="k-sub">{k.sub}</span>
            </Link>
          </Reveal>
        ))}
      </div>

      <div className="grid-2">
        {/* Ticket flow */}
        <div className="card pad-lg stack">
          <div className="card-title row between">
            <h3>Ticket flow — last 8 weeks</h3>
            <Link to="/app/service-desk" className="sm">Open queue →</Link>
          </div>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <AreaChart data={stats.weekly} margin={{ left: -22, right: 6, top: 4 }}>
                <defs>
                  <linearGradient id="ov-opened" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }} />
                <Area name="Opened" type="monotone" dataKey="opened" stroke={CHART_COLORS.accent} strokeWidth={2.2} fill="url(#ov-opened)" />
                <Area name="Resolved" type="monotone" dataKey="closed" stroke={CHART_COLORS.ok} strokeWidth={2.2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category mix */}
        <div className="card pad-lg stack">
          <div className="card-title"><h3>What’s breaking — by category</h3></div>
          <div className="row nowrap" style={{ alignItems: 'center' }}>
            <div style={{ height: 190, width: 190, flex: 'none' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={stats.byCategory} dataKey="count" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                    {stats.byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="stack" style={{ gap: 7, flex: 1, minWidth: 0 }}>
              {stats.byCategory.slice(0, 6).map((c, i) => (
                <div className="row between sm" key={c.name}>
                  <span className="row nowrap" style={{ minWidth: 0, gap: 7 }}>
                    <i style={{ width: 9, height: 9, borderRadius: 3, background: CAT_COLORS[i % CAT_COLORS.length], flex: 'none' }} />
                    <span className="ellipsis">{c.name}</span>
                  </span>
                  <b className="num">{c.count}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Active alerts */}
        <div className="card pad-lg stack">
          <div className="card-title row between">
            <h3>Monitoring alerts</h3>
            {can('infrastructure.device.view') && <Link to="/app/monitoring" className="sm">NOC →</Link>}
          </div>
          {alerts.length === 0 && <div className="note ok">All clear — no active alerts on monitored devices.</div>}
          {alerts.slice(0, 5).map(a => {
            const dev = data.devices.find(d => d.id === a.deviceId);
            return (
              <div key={a.id} className="row between card flat card-tight">
                <span className="row nowrap" style={{ minWidth: 0 }}>
                  <span className={`status-dot ${a.severity === 'critical' ? 'down' : a.severity === 'warning' ? 'degraded' : 'up'}`} />
                  <span style={{ minWidth: 0 }}>
                    <div className="b sm ellipsis">{a.message}</div>
                    <div className="xs muted">{dev?.name} · {fmtTimeAgo(a.createdAt)}</div>
                  </span>
                </span>
                {can('infrastructure.alert.manage') && (
                  <button className="btn sm secondary" onClick={async () => { await acknowledgeAlert(ctx, a.id); toast('Alert acknowledged'); }}>Ack</button>
                )}
              </div>
            );
          })}
          {can('infrastructure.device.manage') && (
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }}
              onClick={async () => { const anyDev = devices.find(d => d.status === 'up'); if (anyDev) { const r = await simulateDeviceOutage(ctx, anyDev.id); toast(r.deduped ? 'Outage already raised for this device' : `Simulated outage → incident created`, 'info'); } }}>
              <Icon name="zap" size={13} /> Simulate an outage (demo)
            </button>
          )}
        </div>

        {/* My queue / contract radar */}
        <div className="card pad-lg stack">
          <div className="card-title"><h3>{isExec ? 'Contract & risk radar' : 'My queue'}</h3></div>
          {isExec ? (
            <>
              <div className="row between">
                <span className="muted sm">Open risk exposure</span>
                <Badge tone={rScore >= 60 ? 'bad' : rScore >= 30 ? 'warn' : 'ok'}>{rScore >= 60 ? 'High' : rScore >= 30 ? 'Moderate' : 'Low'}</Badge>
              </div>
              <div className="bar"><i style={{ width: `${rScore}%`, background: rScore >= 60 ? 'var(--bad)' : rScore >= 30 ? 'var(--warn)' : 'var(--ok)' }} /></div>
              {agreements.slice(0, 3).map(a => (
                <div key={a.id} className="row between sm">
                  <span className="ellipsis">{a.name}</span>
                  <Badge tone={a.daysLeft < 10 ? 'bad' : 'warn'}>{a.daysLeft}d left</Badge>
                </div>
              ))}
              {agreements.length === 0 && <p className="muted sm">No agreements expiring in the next 30 days.</p>}
            </>
          ) : myQueue.length === 0 ? (
            <Empty title="Nothing assigned to you" hint="Great timing — check the team queue in the service desk." />
          ) : (
            myQueue.slice(0, 5).map(x => (
              <Link key={x.id} to={`/app/service-desk/${x.id}`} className="card flat card-tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <span className="row nowrap" style={{ minWidth: 0 }}>
                    <span className="mono xs" style={{ color: 'var(--faint)' }}>{x.number}</span>
                    <span className="b sm ellipsis">{x.title}</span>
                  </span>
                  <StatusBadge s={x.priority} />
                </div>
                <div className="xs muted" style={{ marginTop: 3 }}>
                  {branchName(data, x.branchId)} · opened {fmtTimeAgo(x.createdAt)}
                  {x.resolveDueAt && <> · due in {fmtDuration(new Date(x.resolveDueAt).getTime() - Date.now())}</>}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* CSAT + category bar */}
      <div className="grid-2">
        <div className="card pad-lg stack">
          <div className="card-title"><h3>Weekly volumes</h3></div>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <BarChart data={stats.weekly} margin={{ left: -22, right: 0, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="opened" name="Opened" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                <Bar dataKey="closed" name="Resolved" fill={CHART_COLORS.ok} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card pad-lg stack">
          <div className="card-title"><h3>Service quality</h3></div>
          <div className="stat-strip">
            <div><span className="lbl">First response</span><b style={{ fontSize: 20 }}>{stats.avgFirstResponseMin != null ? fmtDuration(stats.avgFirstResponseMin * 60000) : '—'}</b></div>
            <div><span className="lbl">Avg resolution</span><b style={{ fontSize: 20 }}>{stats.avgResolveMin != null ? fmtDuration(stats.avgResolveMin * 60000) : '—'}</b></div>
            <div><span className="lbl">CSAT</span><b style={{ fontSize: 20 }}>{stats.csat != null ? `${stats.csat}/5` : '—'}</b></div>
            <div><span className="lbl">Resolved (30d)</span><b style={{ fontSize: 20 }}>{stats.resolvedThisMonth}</b></div>
          </div>
          <div className="divider" />
          <div className="stack" style={{ gap: 8 }}>
            {stats.byPriority.map(p => (
              <div className="row between sm" key={p.name}>
                <span className="capitalize">{p.name}</span>
                <span className="row nowrap" style={{ gap: 8, flex: 1, maxWidth: 220, justifyContent: 'flex-end' }}>
                  <div className="bar thin" style={{ flex: 1 }}><i style={{ width: `${pct(p.count, Math.max(1, ...stats.byPriority.map(x => x.count)))}%` }} /></div>
                  <b className="num">{p.count}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

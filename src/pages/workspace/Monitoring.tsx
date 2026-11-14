/** Monitoring — NOC dark surface: topology map, fleet table, alert stream. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { fleetHealth } from '../../platform/metrics';
import { acknowledgeAlert, resolveAlert, simulateDeviceOutage } from '../../platform/db';
import type { Device } from '../../platform/types';
import { Badge, Empty, PageHead, Table, toast } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { fmtDateTime, fmtTimeAgo } from '../../platform/util';
import { latencyClass } from '../../platform/net';
import { branchName } from './lookups';

const KIND_ICON: Record<Device['kind'], IconName> = {
  wan: 'globe', router: 'infra', firewall: 'shield', switch: 'layers', ap: 'wifi',
  server: 'server', ups: 'zap', printer: 'printer', cctv: 'eye',
};

function Topology({ devices, sel, onSelect }: { devices: Device[]; sel?: string; onSelect: (id: string) => void }) {
  // Layout: roots (no parent) across the top, children below their parents.
  const { layers, links } = useMemo(() => {
    const roots = devices.filter(d => !d.parentId);
    const layersOf = new Map<number, Device[]>(); const linksOf: { from: Device; to: Device }[] = [];
    const walk = (ds: Device[], depth: number) => {
      layersOf.set(depth, [...(layersOf.get(depth) ?? []), ...ds]);
      for (const d of ds) {
        const kids = devices.filter(x => x.parentId === d.id);
        kids.forEach(k => linksOf.push({ from: d, to: k }));
        if (kids.length) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
    return { layers: layersOf, links: linksOf };
  }, [devices]);

  const W = 960, LH = 118;
  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((ds, depth) => {
    const gap = W / (ds.length + 1);
    ds.forEach((d, i) => pos.set(d.id, { x: gap * (i + 1), y: 42 + depth * LH }));
  });
  const height = Math.max(200, layers.size * LH + 40);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="topology-svg" role="img" aria-label="Network topology">
      {links.map(l => {
        const a = pos.get(l.from.id)!; const b = pos.get(l.to.id)!;
        const bad = l.to.status === 'down' || l.from.status === 'down';
        return <line key={`${a.x}-${b.x}`} className={`topo-link ${bad ? 'off' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}
      {devices.map(d => {
        const p = pos.get(d.id)!; const cls = d.status === 'up' ? 'up' : d.status === 'degraded' ? 'degraded' : 'down';
        return (
          <g key={d.id} className="topo-node" onClick={() => onSelect(d.id)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={24} fill={sel === d.id ? 'rgba(77,141,255,.22)' : 'rgba(255,255,255,.04)'} stroke={d.status === 'up' ? '#34d399' : d.status === 'degraded' ? '#e8a13c' : '#ff6a5c'} strokeWidth={sel === d.id ? 2.5 : 1.5} />
            <foreignObject x={p.x - 12} y={p.y - 11} width={24} height={24} pointerEvents="none">
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#cfe0f5' }}>
                <Icon name={KIND_ICON[d.kind]} size={16} />
              </div>
            </foreignObject>
            <circle cx={p.x + 17} cy={p.y - 17} r={4} fill={d.status === 'up' ? '#34d399' : d.status === 'degraded' ? '#e8a13c' : '#ff6a5c'} className={cls} />
            <text x={p.x} y={p.y + 40} textAnchor="middle" fill="#93a7c4" style={{ font: '500 10.5px Inter, sans-serif' }}>{d.name}</text>
            <text x={p.x} y={p.y + 53} textAnchor="middle" fill="#5c7190" style={{ font: '500 9.5px Inter, sans-serif' }}>{d.ip} · {d.latencyMs}ms</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Monitoring() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [params, setParams] = useSearchParams();
  const selId = params.get('device') ?? undefined;
  const [refreshTick, setRefreshTick] = useState(Date.now());

  const devices = data.devices.filter(d => d.tenantId === ctx.tenantId);
  const monitored = devices.filter(d => d.monitored);
  const health = fleetHealth(monitored);
  const alerts = data.alerts.filter(a => a.tenantId === ctx.tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sel = devices.find(d => d.id === selId);

  const setSel = (id: string) => setParams(selId === id ? {} : { device: id });

  return (
    <div className="stack noc">
      <PageHead crumbs={[tenant.name, 'Monitoring']} title="Network operations centre"
        sub={`${monitored.length} devices under watch · availability ${health.availabilityPct ?? '—'}%`}
        actions={
          <div className="row">
            <span className="xs muted no-print">refreshed {fmtTimeAgo(new Date(refreshTick).toISOString())}</span>
            <button className="btn secondary sm no-print" onClick={() => setRefreshTick(Date.now())}><Icon name="refresh" size={13} /> Refresh</button>
            {can('infrastructure.device.manage') && (
              <button className="btn secondary sm" onClick={() => {
                const up = monitored.find(d => d.status === 'up');
                if (!up) return toast('Nothing healthy to simulate against', 'info');
                const r = simulateDeviceOutage(ctx, up.id);
                toast(r.deduped ? `${up.name} already has an open incident` : `Outage on ${up.name} → incident opened`, 'info');
              }}><Icon name="zap" size={13} /> Simulate outage</button>
            )}
          </div>
        } />

      <div className="grid-4">
        {[
          { l: 'Up', v: health.up, cls: 'noc-glow-up' },
          { l: 'Degraded', v: health.degraded, cls: 'noc-glow-warn' },
          { l: 'Down', v: health.down, cls: 'noc-glow-down' },
          { l: 'Active alerts', v: alerts.filter(a => a.status === 'active').length, cls: alerts.some(a => a.status === 'active' && a.severity === 'critical') ? 'noc-glow-down' : '' },
        ].map(k => (
          <div key={k.l} className="card kpi"><span className="k-label">{k.l}</span><span className={`k-value ${k.cls}`}>{k.v}</span></div>
        ))}
      </div>

      <div className="card pad-lg">
        <h3 style={{ marginBottom: 8 }}>Topology — live uplink map</h3>
        {devices.length > 0
          ? <Topology devices={devices} sel={selId} onSelect={setSel} />
          : <Empty icon="infra" title="No devices yet" hint="Register devices in this workspace to draw the map." />}
      </div>

      {sel && (
        <div className="card pad-lg">
          <div className="row between">
            <h3>{sel.name} <span className="xs mono muted">{sel.ip} · {sel.model}</span></h3>
            <span className={`status-dot ${sel.status}`} />
          </div>
          <div className="grid-4" style={{ marginTop: 12 }}>
            <div><div className="lbl">Latency</div><b className="num">{sel.latencyMs} ms</b><div className="xs muted">{latencyClass(sel.latencyMs).label}</div></div>
            <div><div className="lbl">Packet loss</div><b className="num">{sel.packetLossPct}%</b></div>
            <div><div className="lbl">CPU / Memory</div><b className="num">{sel.cpuPct ?? '—'}% / {sel.memPct ?? '—'}%</b></div>
            <div><div className="lbl">Storage</div>
              {sel.storagePct != null ? <><b className="num">{sel.storagePct}%</b><div className="bar thin" style={{ marginTop: 4 }}><i style={{ width: `${sel.storagePct}%`, background: sel.storagePct > 85 ? 'var(--bad)' : 'var(--accent)' }} /></div></> : '—'}
            </div>
          </div>
          <div className="xs muted" style={{ marginTop: 10 }}>Branch: {branchName(data, sel.branchId)} · last seen {fmtDateTime(sel.lastSeenAt)}{sel.monitored ? ' · monitored' : ' · not monitored'}</div>
        </div>
      )}

      <div className="card pad-lg stack">
        <h3>Alert stream</h3>
        {alerts.length === 0 && <div className="note ok">No alerts recorded.</div>}
        {alerts.slice(0, 12).map(a => {
          const dev = devices.find(d => d.id === a.deviceId);
          return (
            <div key={a.id} className="row between card flat card-tight">
              <span className="row nowrap" style={{ minWidth: 0, gap: 10 }}>
                <span className={`status-dot ${a.severity === 'critical' ? 'down' : a.severity === 'warning' ? 'degraded' : 'up'}`} />
                <span style={{ minWidth: 0 }}>
                  <div className="b sm">{a.message}</div>
                  <div className="xs muted">{dev?.name ?? '—'} · {fmtTimeAgo(a.createdAt)}{a.incidentId ? ` · linked incident` : ''}</div>
                </span>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <Badge tone={a.status === 'active' ? 'bad' : a.status === 'acknowledged' ? 'warn' : 'ok'}>{a.status}</Badge>
                {can('infrastructure.alert.manage') && a.status === 'active' && <button className="btn sm secondary" onClick={() => { acknowledgeAlert(ctx, a.id); toast('Acknowledged'); }}>Ack</button>}
                {can('infrastructure.alert.manage') && a.status !== 'resolved' && <button className="btn sm ghost" onClick={() => { resolveAlert(ctx, a.id); toast('Marked resolved'); }}>Resolve</button>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card pad-lg stack">
        <h3>Fleet table</h3>
        <Table head={['Device', 'Kind', 'Branch', 'IP', 'Latency', 'Loss', 'Status']}>
          {devices.map(d => (
            <tr key={d.id} className="clickable" onClick={() => setSel(d.id)}>
              <td className="b sm"><Icon name={KIND_ICON[d.kind]} size={14} style={{ marginRight: 7, verticalAlign: '-3px', color: 'var(--muted)' }} />{d.name}</td>
              <td className="sm">{d.kind}</td>
              <td className="sm">{branchName(data, d.branchId)}</td>
              <td className="mono sm">{d.ip}</td>
              <td className="num sm">{d.latencyMs} ms</td>
              <td className="num sm">{d.packetLossPct}%</td>
              <td><Badge tone={d.status === 'up' ? 'ok' : d.status === 'degraded' ? 'warn' : 'bad'} pulse={d.status !== 'up'}>{d.status}</Badge></td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

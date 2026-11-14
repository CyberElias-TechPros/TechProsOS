/** Asset detail — QR label, lifecycle timeline, depreciation curve, linked tickets & work orders. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { updateAsset, createWorkOrder as createWO } from '../../platform/actions';
import { depreciatedValue } from '../../platform/db';
import type { AssetLifecycle } from '../../platform/types';
import { Badge, Empty, KV, PageHead, StatusBadge, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { DAYS, daysUntil, fmtDate, fmtTimeAgo, ngn, pct } from '../../platform/util';
import { branchName, userName } from './lookups';

export default function AssetDetail() {
  const { id } = useParams();
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [qr, setQr] = useState<string>('');

  const asset = data.assets.find(a => a.id === id && a.tenantId === ctx.tenantId);
  useEffect(() => {
    if (!asset) return;
    QRCode.toDataURL(`${tenant.slug}:${asset.tag}:${asset.id}`, { margin: 1, width: 220 })
      .then(setQr).catch(() => setQr(''));
  }, [asset, tenant.slug]);

  const workOrders = useMemo(() => data.workOrders.filter(w => w.assetId === id), [data.workOrders, id]);
  const tickets = useMemo(() => data.tickets.filter(tk => tk.assetId === id), [data.tickets, id]);

  if (!asset) {
    return <Empty icon="assets" title="Asset not found" hint="It may have been disposed or belongs to another workspace."
      action={<Link to="/app/assets" className="btn secondary">Back to register</Link>} />;
  }

  const value = depreciatedValue(asset);
  const valuePct = pct(value, asset.purchaseCost || 1);
  const wDays = asset.warrantyExpiry ? daysUntil(asset.warrantyExpiry) : null;
  const history = data.auditLogs.filter(a => a.entity === 'asset' && a.entityId === asset.id).slice(0, 10);

  const setLifecycle = async (lifecycle: AssetLifecycle) => {
    if (!can('assets.asset.update')) { toast('No permission to update assets', 'bad'); return; }
    await updateAsset(ctx, asset.id, { lifecycle });
    toast(`Lifecycle → ${lifecycle.replace(/_/g, ' ')}`);
  };

  const raiseWorkOrder = async () => {
    const wId = await createWO(ctx, {
      title: `Corrective maintenance — ${asset.name}`, kind: 'corrective',
      assetId: asset.id, branchId: asset.branchId, dueAt: new Date(Date.now() + 3 * DAYS).toISOString(),
      checklist: ['Inspect and diagnose fault', 'Repair or replace components', 'Test under load', 'Return to service'],
    });
    toast('Work order raised from this asset');
    void wId;
  };

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Assets', asset.tag]} title={asset.name}
        sub={`${asset.manufacturer} ${asset.model} · serial ${asset.serial}`}
        actions={
          can('maintenance.workorder.manage') ? (
            <button className="btn secondary" onClick={raiseWorkOrder}><Icon name="maintenance" size={14} /> Raise work order</button>
          ) : undefined
        } />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)' }}>
        <div className="stack">
          <div className="card pad-lg stack">
            <div className="row between">
              <h3>Register card</h3>
              <StatusBadge s={asset.lifecycle === 'in_service' ? 'active' : asset.lifecycle === 'in_repair' ? 'in_progress' : asset.lifecycle === 'retired' ? 'expired' : ''} />
            </div>
            <KV items={[
              ['Tag', <span className="mono">{asset.tag}</span>],
              ['Category', asset.category],
              ['Serial', <span className="mono">{asset.serial || '—'}</span>],
              ['Branch', branchName(data, asset.branchId)],
              ['Custodian', asset.assigneeId ? userName(data, asset.assigneeId) : 'Pool (unassigned)'],
              ['Purchased', `${fmtDate(asset.purchaseDate)} for ${ngn(asset.purchaseCost)}`],
              ['Book value today', <b>{ngn(value)} <span className="xs faint">({valuePct}% remaining)</span></b>],
              ['Warranty', asset.warrantyExpiry ? (wDays! < 0 ? <Badge>expired {fmtDate(asset.warrantyExpiry)}</Badge> : wDays! <= 60 ? <Badge tone="warn">{wDays} days left</Badge> : <Badge tone="ok">until {fmtDate(asset.warrantyExpiry)}</Badge>) : '—'],
              ['Condition', asset.condition],
              ['Registered', fmtTimeAgo(asset.createdAt)],
            ]} />
            <div className="bar thin"><i style={{ width: `${valuePct}%` }} /></div>
          </div>

          <div className="card pad-lg stack">
            <h3>Work & support history</h3>
            {tickets.length === 0 && workOrders.length === 0 && <p className="muted sm">Nothing on record for this asset yet.</p>}
            {workOrders.slice(0, 5).map(w => (
              <div key={w.id} className="row between card flat card-tight">
                <span><b className="sm">{w.number}</b> <span className="sm">{w.title}</span></span>
                <StatusBadge s={w.status} />
              </div>
            ))}
            {tickets.slice(0, 5).map(t => (
              <Link key={t.id} to={`/app/service-desk/${t.id}`} className="row between card flat card-tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span><b className="sm mono faint">{t.number}</b> <span className="sm">{t.title}</span></span>
                <StatusBadge s={t.status} />
              </Link>
            ))}
          </div>
        </div>

        <div className="stack">
          {qr && (
            <div className="card pad-lg stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <img src={qr} width={150} height={150} alt={`QR label for ${asset.tag}`} />
              <b className="mono">{asset.tag}</b>
              <p className="xs muted">Print and stick on the device. Scanning resolves to this record.</p>
              <button className="btn secondary sm" onClick={() => window.print()}><Icon name="printer" size={13} /> Print label</button>
            </div>
          )}
          {can('assets.asset.update') && (
            <div className="card pad-lg stack">
              <div className="lbl">Lifecycle</div>
              {(['in_service', 'in_storage', 'in_repair', 'retired', 'disposed'] as const).map(l => (
                <button key={l} className={`chip ${asset.lifecycle === l ? '' : ''}`} aria-pressed={asset.lifecycle === l} onClick={() => setLifecycle(l)} style={{ justifyContent: 'flex-start' }}>
                  {l.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="card pad-lg stack">
              <div className="lbl">Audit trail</div>
              {history.map(h => (
                <div key={h.id} className="timeline-item"><span className="t-dot" />
                  <span><span className="sm">{h.summary}</span><br /><span className="xs faint">{h.actorName} · {fmtTimeAgo(h.at)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

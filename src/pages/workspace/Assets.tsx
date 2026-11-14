/** Assets — register with lifecycle, depreciation, QRs, bulk CSV export. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { createAsset, depreciatedValue } from '../../platform/db';
import type { AssetLifecycle } from '../../platform/types';
import { Badge, Empty, Modal, PageHead, StatusBadge, Table, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { DAYS, downloadText, ngn, toCsv } from '../../platform/util';
import { branchName, userName } from './lookups';

const LIFECYCLE: AssetLifecycle[] = ['in_service', 'in_storage', 'in_repair', 'retired', 'disposed'];

export default function Assets() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [life, setLife] = useState('');
  const [branch, setBranch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const mine = useMemo(() => data.assets.filter(a => a.tenantId === ctx.tenantId), [data, ctx.tenantId]);
  const cats = useMemo(() => [...new Set(mine.map(a => a.category))].sort(), [mine]);
  const catsWithCounts = cats.map(c => [c, mine.filter(a => a.category === c).length] as [string, number]);

  const filtered = useMemo(() => {
    let xs = mine;
    const needle = q.trim().toLowerCase();
    if (needle) xs = xs.filter(a => `${a.tag} ${a.name} ${a.serial} ${a.model}`.toLowerCase().includes(needle));
    if (cat) xs = xs.filter(a => a.category === cat);
    if (life) xs = xs.filter(a => a.lifecycle === life);
    if (branch) xs = xs.filter(a => a.branchId === branch);
    return xs;
  }, [mine, q, cat, life, branch]);

  const bookValue = filtered.reduce((a, x) => a + depreciatedValue(x), 0);
  const warrantySoon = mine.filter(a => a.warrantyExpiry && daysBetween(a.warrantyExpiry) <= 60 && daysBetween(a.warrantyExpiry) > 0).length;
  const branches = data.branches.filter(b => b.tenantId === ctx.tenantId);

  const exportCsv = () => {
    downloadText(`assets-${tenant.slug}.csv`, toCsv([
      ['Tag', 'Name', 'Category', 'Branch', 'Assignee', 'Lifecycle', 'Cost (NGN)', 'Book value (NGN)', 'Warranty expires'],
      ...filtered.map(a => [a.tag, a.name, a.category, branchName(data, a.branchId), userName(data, a.assigneeId), a.lifecycle, a.purchaseCost, Math.round(depreciatedValue(a)), a.warrantyExpiry ?? '']),
    ]), 'text/csv');
    toast(`Exported ${filtered.length} assets to CSV`);
  };

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Assets']} title="Assets & inventory"
        sub={`${filtered.length} items · book value ${ngn(bookValue)}${warrantySoon ? ` · ${warrantySoon} warranties expiring within 60 days` : ''}`}
        actions={
          <div className="row">
            <button className="btn secondary" onClick={exportCsv}><Icon name="download" size={14} /> Export CSV</button>
            {can('assets.asset.create') && <button className="btn" onClick={() => setCreateOpen(true)}><Icon name="plus" size={14} /> Add asset</button>}
          </div>
        } />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {catsWithCounts.slice(0, 8).map(([c, n]) => (
          <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)} style={{ justifyContent: 'space-between', width: '100%' }}>
            {c} <b className="num">{n}</b>
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: '0 1 280px' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search tag, name, serial…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search assets" />
        </div>
        <select className="select" style={{ maxWidth: 170 }} value={life} onChange={e => setLife(e.target.value)} aria-label="Lifecycle">
          <option value="">All states</option>
          {LIFECYCLE.map(l => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 170 }} value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="assets" title="No assets match" hint="Add your first asset to start the register." />
      ) : (
        <Table head={['Asset', 'Category', 'Branch', 'Assignee', 'Lifecycle', 'Book value', 'Warranty', '']}>
          {filtered.map(a => {
            const wDays = a.warrantyExpiry ? daysBetween(a.warrantyExpiry) : null;
            return (
              <tr key={a.id} className="clickable" onClick={() => navigate(`/app/assets/${a.id}`)}>
                <td style={{ minWidth: 220 }}>
                  <div className="b sm">{a.name}</div>
                  <div className="xs mono faint">{a.tag} · {a.model}</div>
                </td>
                <td className="sm">{a.category}</td>
                <td className="sm">{branchName(data, a.branchId)}</td>
                <td className="sm">{a.assigneeId ? userName(data, a.assigneeId) : <span className="faint">Pool</span>}</td>
                <td><StatusBadge s={a.lifecycle === 'in_service' ? 'active' : a.lifecycle === 'in_repair' ? 'in_progress' : a.lifecycle === 'retired' ? 'expired' : ''} /></td>
                <td className="num">{ngn(depreciatedValue(a))}</td>
                <td>{wDays == null ? <span className="faint sm">—</span> : wDays < 0 ? <Badge>expired</Badge> : wDays <= 60 ? <Badge tone="warn">{wDays}d</Badge> : <span className="sm">✓</span>}</td>
                <td><Icon name="chevronR" size={14} style={{ color: 'var(--faint)' }} /></td>
              </tr>
            );
          })}
        </Table>
      )}

      <AssetForm open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function daysBetween(iso: string) { return Math.ceil((new Date(iso).getTime() - Date.now()) / DAYS); }

export function AssetForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const data = useData(s => s.data);
  const branches = data.branches.filter(b => b.tenantId === ctx.tenantId);
  const [f, setF] = useState({ name: '', category: 'End-user computing', manufacturer: '', model: '', serial: '', branchId: '', cost: 750000, years: 4 });
  const submit = () => {
    const id = createAsset(ctx, {
      name: f.name.trim(), category: f.category, manufacturer: f.manufacturer.trim(), model: f.model.trim(), serial: f.serial.trim(),
      branchId: f.branchId || branches[0]?.id || '', purchaseDate: new Date().toISOString(),
      purchaseCost: f.cost, usefulLifeYears: f.years,
    });
    toast(`Asset registered — ${id}`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Register an asset">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Name</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Teacher laptop — Dell Latitude 3440" autoFocus /></div>
        <div className="field"><label>Category</label>
          <select className="select" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {['End-user computing', 'Network', 'Server & storage', 'Printing', 'Power & UPS', 'AV & classroom', 'CCTV & access', 'Mobile'].map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label>Branch</label>
          <select className="select" value={f.branchId} onChange={e => setF({ ...f, branchId: e.target.value })}>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name} — {b.city}</option>)}
          </select></div>
        <div className="field"><label>Manufacturer</label><input className="input" value={f.manufacturer} onChange={e => setF({ ...f, manufacturer: e.target.value })} placeholder="Dell" /></div>
        <div className="field"><label>Model</label><input className="input" value={f.model} onChange={e => setF({ ...f, model: e.target.value })} placeholder="Latitude 3440" /></div>
        <div className="field"><label>Serial</label><input className="input mono" value={f.serial} onChange={e => setF({ ...f, serial: e.target.value })} placeholder="DL55210Q" /></div>
        <div className="field"><label>Purchase cost (₦)</label><input className="input" type="number" value={f.cost} onChange={e => setF({ ...f, cost: +e.target.value })} /></div>
        <div className="field"><label>Useful life (years)</label><input className="input" type="number" value={f.years} onChange={e => setF({ ...f, years: +e.target.value })} /></div>
      </div>
      <button className="btn block" disabled={f.name.trim().length < 3} onClick={submit}>Register asset</button>
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>A scannable QR label is generated automatically on the asset page.</p>
    </Modal>
  );
}

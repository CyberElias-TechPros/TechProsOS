/** Procurement — vendors, purchase orders with approval flow, stock with reorder radar. */
import { useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { createPurchaseOrder, createVendor, setPoStatus } from '../../platform/actions';
import { tenantUsers } from '../../platform/db';
import { Badge, Empty, Modal, PageHead, StatusBadge, Table, Tabs, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDate, ngn } from '../../platform/util';
import { userName } from './lookups';
import type { POStatus } from '../../platform/types';

const NEXT_PO: Record<POStatus, POStatus | null> = {
  requested: 'approved', approved: 'ordered', ordered: 'received', received: null, cancelled: null,
};

export default function Procurement() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('po');
  const [poModal, setPoModal] = useState(false);
  const [vendorModal, setVendorModal] = useState(false);

  const vendors = data.vendors.filter(v => v.tenantId === ctx.tenantId);
  const pos = data.purchaseOrders.filter(p => p.tenantId === ctx.tenantId);
  const stock = data.stockItems.filter(s => s.tenantId === ctx.tenantId);
  const low = stock.filter(s => s.qty <= s.reorderLevel);
  void tenantUsers;

  const canApprove = can('procurement.po.approve');
  const canCreate = can('procurement.po.create');

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Procurement']} title="Procurement & vendors"
        sub="Who you buy from, what’s in flight, and what’s about to run out."
        actions={
          <div className="row">
            {can('procurement.vendor.manage') && <button className="btn secondary" onClick={() => setVendorModal(true)}><Icon name="plus" size={14} /> Vendor</button>}
            {canCreate && <button className="btn" onClick={() => setPoModal(true)}><Icon name="plus" size={14} /> Purchase order</button>}
          </div>
        } />

      {low.length > 0 && <div className="note">{low.length} stock item{low.length > 1 ? 's' : ''} at or below reorder level.</div>}

      <div className="card pad-lg stack">
        <Tabs tabs={[['po', `Purchase orders (${pos.length})`], ['vendors', `Vendors (${vendors.length})`], ['stock', `Stock (${stock.length})`]]} value={tab} onChange={setTab} />
      </div>

      {tab === 'po' && (
        pos.length === 0 ? <Empty icon="procurement" title="No purchase orders" /> : (
          <Table head={['PO', 'Vendor', 'Items', 'Value', 'Status', 'Requested', 'Action']}>
            {pos.map(po => {
              const vendor = vendors.find(v => v.id === po.vendorId);
              const value = po.items.reduce((a, i) => a + i.qty * i.unitCost, 0);
              const next = NEXT_PO[po.status];
              const mayAdvance = next && (po.status !== 'requested' || canApprove);
              return (
                <tr key={po.id}>
                  <td className="mono sm">{po.number}</td>
                  <td className="b sm">{vendor?.name ?? '—'}</td>
                  <td className="sm">{po.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</td>
                  <td className="num">{ngn(value)}</td>
                  <td><StatusBadge s={po.status} /></td>
                  <td className="sm">{userName(data, po.requestedBy)}</td>
                  <td>
                    {mayAdvance && (
                      <button className="btn sm secondary" onClick={async () => { await setPoStatus(ctx, po.id, next!); toast(`${po.number} → ${next}`); }}>
                        {po.status === 'requested' ? 'Approve' : po.status === 'approved' ? 'Mark ordered' : 'Mark received'}
                      </button>
                    )}
                    {po.status === 'requested' && !canApprove && <span className="xs faint">awaiting approver</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )
      )}

      {tab === 'vendors' && (
        vendors.length === 0 ? <Empty icon="clients" title="No vendors registered" /> : (
          <div className="grid-3">
            {vendors.map(v => (
              <div key={v.id} className="card pad-lg stack" style={{ gap: 8 }}>
                <div className="row between">
                  <b>{v.name}</b>
                  <StatusBadge s={v.status} />
                </div>
                <div className="sm muted">{v.category}</div>
                <div className="xs">{v.contact} · {v.email}</div>
                <div className="row between">
                  <span className="mono xs faint">{v.phone}</span>
                  <span className="sm">{'★'.repeat(Math.round(v.rating))}<span className="faint">{'★'.repeat(5 - Math.round(v.rating))}</span></span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'stock' && (
        stock.length === 0 ? <Empty icon="layers" title="No stock items tracked" /> : (
          <Table head={['Item', 'SKU', 'Category', 'On hand', 'Reorder at', 'Unit cost', 'State']}>
            {stock.map(s => (
              <tr key={s.id}>
                <td className="b sm">{s.name}</td>
                <td className="mono sm">{s.sku}</td>
                <td className="sm">{s.category}</td>
                <td className="num">{s.qty}</td>
                <td className="num">{s.reorderLevel}</td>
                <td className="num">{ngn(s.unitCost)}</td>
                <td>{s.qty <= 0 ? <Badge tone="bad" pulse>Out of stock</Badge> : s.qty <= s.reorderLevel ? <Badge tone="warn">Reorder now</Badge> : <Badge tone="ok">Healthy</Badge>}</td>
              </tr>
            ))}
          </Table>
        )
      )}

      {poModal && <PoModal onClose={() => setPoModal(false)} />}
      {vendorModal && <VendorModal onClose={() => setVendorModal(false)} />}
    </div>
  );
}

function PoModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const data = useData(s => s.data);
  const vendors = data.vendors.filter(v => v.tenantId === ctx.tenantId);
  const [f, setF] = useState({ vendorId: vendors[0]?.id ?? '', name: '', qty: 1, unitCost: 250_000 });
  const submit = async () => {
    await createPurchaseOrder(ctx, { vendorId: f.vendorId, items: [{ name: f.name.trim(), qty: f.qty, unitCost: f.unitCost }] });
    toast('Purchase order requested — routing to approver');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New purchase order">
      <div className="form-grid">
        <div className="field"><label>Vendor</label>
          <select className="select" value={f.vendorId} onChange={e => setF({ ...f, vendorId: e.target.value })}>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>What are we buying?</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="UniFi U6-Enterprise access point" /></div>
        <div className="field"><label>Quantity</label>
          <input className="input" type="number" value={f.qty} onChange={e => setF({ ...f, qty: +e.target.value })} /></div>
        <div className="field"><label>Unit cost (₦)</label>
          <input className="input" type="number" value={f.unitCost} onChange={e => setF({ ...f, unitCost: +e.target.value })} /></div>
      </div>
      <div className="row between b"><span>Order total</span><span>{ngn(f.qty * f.unitCost)}</span></div>
      <button className="btn block" disabled={!f.vendorId || f.name.trim().length < 3} onClick={submit}>Request approval</button>
    </Modal>
  );
}

function VendorModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ name: '', category: 'Hardware', contact: '', email: '', phone: '' });
  const submit = async () => {
    await createVendor(ctx, { name: f.name.trim(), category: f.category, contact: f.contact.trim(), email: f.email.trim(), phone: f.phone.trim() });
    toast('Vendor registered');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Register a vendor">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Company</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Synthwave Systems Ltd" autoFocus /></div>
        <div className="field"><label>Category</label>
          <select className="select" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {['Hardware', 'Software licensing', 'Internet & telecoms', 'Power & facilities', 'Consulting', 'Consumables'].map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label>Contact person</label><input className="input" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></div>
        <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
      </div>
      <button className="btn block" disabled={f.name.trim().length < 3} onClick={submit}>Register vendor</button>
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>Rating starts at 3/5 and adjusts as you complete orders. Today: {fmtDate(new Date().toISOString())}</p>
    </Modal>
  );
}

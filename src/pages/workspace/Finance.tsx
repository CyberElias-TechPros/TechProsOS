/** Finance — invoices with Nigerian tax rules, expenses, budgets, printable invoices. */
import { useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { createExpense, createInvoice, depreciatedValue, setInvoiceStatus, invoiceTotals } from '../../platform/db';
import { invoiceNet } from '../../platform/metrics';
import { Badge, Empty, KV, Modal, PageHead, StatusBadge, Table, Tabs, toast, Bar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDate, ngn, pct } from '../../platform/util';
import { branchName } from './lookups';

export default function Finance() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('invoices');
  const [modal, setModal] = useState<'invoice' | 'expense' | null>(null);
  const [showInvoice, setShowInvoice] = useState<string | null>(null);

  const invoices = data.invoices.filter(i => i.tenantId === ctx.tenantId);
  const expenses = data.expenses.filter(e => e.tenantId === ctx.tenantId);
  const budgets = data.budgets.filter(b => b.tenantId === ctx.tenantId);
  const mine = data.assets.filter(a => a.tenantId === ctx.tenantId);
  const fleetValue = mine.reduce((a, x) => a + depreciatedValue(x), 0);

  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((a, i) => a + invoiceNet(i), 0);
  const paidThisMonth = invoices.filter(i => i.status === 'paid' && i.paidAt && new Date(i.paidAt).getMonth() === new Date().getMonth()).reduce((a, i) => a + invoiceNet(i), 0);
  const expTotal = expenses.reduce((a, e) => a + e.amount, 0);
  const printed = showInvoice ? invoices.find(i => i.id === showInvoice) : undefined;

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Finance']} title="Finance & IT costs"
        sub="Operational invoicing and spend — with 7.5% VAT and withholding handled correctly."
        actions={can('finance.invoice.manage') ? (
          <div className="row no-print">
            <button className="btn secondary" onClick={() => setModal('expense')}><Icon name="plus" size={14} /> Expense</button>
            <button className="btn" onClick={() => setModal('invoice')}><Icon name="plus" size={14} /> Invoice</button>
          </div>
        ) : undefined} />

      <div className="grid-4">
        <div className="card kpi"><span className="k-label">Outstanding</span><span className="k-value">{ngn(outstanding, { compact: true })}</span><span className="k-sub">{invoices.filter(i => i.status !== 'paid' && i.status !== 'draft').length} open invoices</span></div>
        <div className="card kpi"><span className="k-label">Collected this month</span><span className="k-value" style={{ color: 'var(--ok)' }}>{ngn(paidThisMonth, { compact: true })}</span></div>
        <div className="card kpi"><span className="k-label">Expenses (recorded)</span><span className="k-value">{ngn(expTotal, { compact: true })}</span><span className="k-sub">{expenses.length} entries</span></div>
        <div className="card kpi"><span className="k-label">Asset book value</span><span className="k-value">{ngn(fleetValue, { compact: true })}</span><span className="k-sub">straight-line depreciation</span></div>
      </div>

      <div className="card pad-lg stack no-print">
        <Tabs tabs={[['invoices', `Invoices (${invoices.length})`], ['expenses', `Expenses (${expenses.length})`], ['budgets', `Budgets (${budgets.length})`]]} value={tab} onChange={setTab} />
      </div>

      {tab === 'invoices' && (
        invoices.length === 0 ? <Empty icon="finance" title="No invoices yet" /> : (
          <Table head={['Invoice', 'Client', 'Issued', 'Due', 'Net receivable', 'Status', '']}>
            {invoices.map(i => (
              <tr key={i.id} className="clickable" onClick={() => setShowInvoice(i.id)}>
                <td className="mono sm">{i.number}</td>
                <td className="b sm">{i.clientName}</td>
                <td className="sm">{fmtDate(i.issuedAt)}</td>
                <td className="sm">{fmtDate(i.dueAt)}</td>
                <td className="num">{ngn(invoiceNet(i))}</td>
                <td><StatusBadge s={i.status} /></td>
                <td className="no-print">
                  {can('finance.invoice.manage') && i.status !== 'paid' && (
                    <button className="btn sm secondary" onClick={e => { e.stopPropagation(); setInvoiceStatus(ctx, i.id, 'paid'); toast(`${i.number} marked paid`); }}>Mark paid</button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )
      )}

      {tab === 'expenses' && (
        expenses.length === 0 ? <Empty icon="dollar" title="No expenses recorded" /> : (
          <Table head={['Title', 'Category', 'Branch', 'Amount', 'Date']}>
            {expenses.map(e => (
              <tr key={e.id}>
                <td className="b sm">{e.title}</td>
                <td className="sm">{e.category}</td>
                <td className="sm">{branchName(data, e.branchId)}</td>
                <td className="num">{ngn(e.amount)}</td>
                <td className="sm">{fmtDate(e.incurredAt)}</td>
              </tr>
            ))}
          </Table>
        )
      )}

      {tab === 'budgets' && (
        budgets.length === 0 ? <Empty icon="finance" title="No budgets set" /> : (
          <div className="grid-2">
            {budgets.map(b => {
              const spent = expenses.filter(e => b.departmentId ? e.departmentId === b.departmentId : true).reduce((a, e) => a + e.amount, 0);
              const used = pct(spent, b.amount || 1);
              return (
                <div key={b.id} className="card pad-lg stack" style={{ gap: 8 }}>
                  <div className="row between"><b>{b.name}</b><Badge tone={used > 90 ? 'bad' : used > 70 ? 'warn' : 'ok'}>{used}% used</Badge></div>
                  <Bar value={used} tone={used > 90 ? 'var(--bad)' : used > 70 ? 'var(--warn)' : 'var(--ok)'} />
                  <div className="row between sm"><span className="muted">FY{b.year} · {ngn(spent)} spent</span><b>{ngn(b.amount)} budget</b></div>
                </div>
              );
            })}
          </div>
        )
      )}

      {modal === 'invoice' && <InvoiceModal onClose={() => setModal(null)} />}
      {modal === 'expense' && <ExpenseModal onClose={() => setModal(null)} />}
      {printed && <InvoiceSheet invoice={printed} onClose={() => setShowInvoice(null)} />}
    </div>
  );
}

function InvoiceSheet({ invoice: i, onClose }: { invoice: import('../../platform/types').Invoice; onClose: () => void }) {
  const { tenant } = useSessionCtx();
  const t = invoiceTotals(i.items, i.vatRate, i.whtRate);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide print-sheet" style={{ maxWidth: 760 }}>
        <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3>Invoice {i.number}</h3>
          <div className="row no-print">
            <button className="btn secondary sm" onClick={() => window.print()}><Icon name="printer" size={13} /> Print / save as PDF</button>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        </div>
        <div style={{ padding: 30 }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <b style={{ fontSize: 18 }}>{tenant.name}</b>
              <div className="sm muted">techpros.com.ng · Lagos, Nigeria</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono b" style={{ fontSize: 16 }}>{i.number}</div>
              <div className="sm muted">Issued {fmtDate(i.issuedAt)} · Due {fmtDate(i.dueAt)}</div>
            </div>
          </div>
          <div style={{ margin: '18px 0' }}>
            <div className="lbl">Bill to</div>
            <b>{i.clientName}</b>
          </div>
          <table className="tbl" style={{ margin: '10px 0' }}>
            <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit (₦)</th><th style={{ textAlign: 'right' }}>Amount (₦)</th></tr></thead>
            <tbody>
              {i.items.map((x, k) => (
                <tr key={k}><td>{x.desc}</td><td style={{ textAlign: 'right' }} className="num">{x.qty}</td><td style={{ textAlign: 'right' }} className="num">{x.unitPrice.toLocaleString('en-NG')}</td><td style={{ textAlign: 'right' }} className="num">{(x.qty * x.unitPrice).toLocaleString('en-NG')}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ maxWidth: 300, marginLeft: 'auto' }}>
            <KV items={[
              ['Subtotal', <span className="num">{ngn(t.subtotal)}</span>],
              [`VAT ${(i.vatRate * 100).toFixed(1)}%`, <span className="num">{ngn(t.vat)}</span>],
              ...(t.wht > 0 ? [[`WHT deducted (${i.whtRate * 100}%)`, <span className="num">−{ngn(t.wht)}</span>] as [string, JSX.Element]] : []),
              ['Total', <b className="num">{ngn(t.total)}</b>],
              ['Net payable', <b className="num" style={{ fontSize: 16, color: 'var(--accent)' }}>{ngn(t.net)}</b>],
            ]} />
          </div>
          {t.wht > 0 && <p className="xs muted" style={{ marginTop: 14 }}>Note: withholding tax of {ngn(t.wht)} ({i.whtRate * 100}%) is deducted at source by the buyer and remitted to FIRS in our name. Please provide the credit note.</p>}
          <p className="xs muted">Pay to: TechPros Services Ltd · GTBank 0123456789 · Reference {i.number}. Questions: accounts@techpros.com.ng</p>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const data = useData(s => s.data);
  const clients = data.tenants.filter(t => t.providerId === ctx.tenantId);
  const [f, setF] = useState({ client: '', desc: '', qty: 1, unitPrice: 500000, whtRate: 0.05, dueDays: 14 });
  const tot = invoiceTotals([{ desc: f.desc || 'Service', qty: f.qty, unitPrice: f.unitPrice }], 0.075, f.whtRate);
  const submit = () => {
    const clientTenantId = clients.find(c => c.name === f.client)?.id;
    createInvoice(ctx, { clientName: f.client.trim(), clientTenantId, items: [{ desc: f.desc.trim(), qty: f.qty, unitPrice: f.unitPrice }], whtRate: f.whtRate, dueDays: f.dueDays });
    toast('Invoice issued');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Issue an invoice">
      <div className="form-grid">
        <div className="field"><label>Client</label>
          {clients.length > 0
            ? <select className="select" value={f.client} onChange={e => setF({ ...f, client: e.target.value })}><option value="">Choose…</option>{clients.map(c => <option key={c.id}>{c.name}</option>)}</select>
            : <input className="input" value={f.client} onChange={e => setF({ ...f, client: e.target.value })} placeholder="Greenfield Academy" />}
        </div>
        <div className="field"><label>Due in</label>
          <select className="select" value={f.dueDays} onChange={e => setF({ ...f, dueDays: +e.target.value })}>
            {[7, 14, 30].map(d => <option key={d} value={d}>{d} days</option>)}
          </select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Line item</label>
          <input className="input" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="Managed IT services — December" /></div>
        <div className="field"><label>Qty</label><input className="input" type="number" value={f.qty} onChange={e => setF({ ...f, qty: +e.target.value })} /></div>
        <div className="field"><label>Unit price (₦)</label><input className="input" type="number" value={f.unitPrice} onChange={e => setF({ ...f, unitPrice: +e.target.value })} /></div>
        <div className="field"><label>Withholding tax</label>
          <select className="select" value={f.whtRate} onChange={e => setF({ ...f, whtRate: +e.target.value })}>
            <option value={0.05}>5% — general services</option><option value={0.1}>10% — commission etc.</option><option value={0}>None</option>
          </select></div>
      </div>
      <div className="card flat card-tight">
        <div className="row between sm"><span>Subtotal + VAT 7.5%</span><b className="num">{ngn(tot.total)}</b></div>
        <div className="row between sm"><span className="muted">WHT withheld by buyer</span><span className="num">−{ngn(tot.wht)}</span></div>
        <div className="divider" />
        <div className="row between"><b>You actually receive</b><b className="num" style={{ color: 'var(--accent)' }}>{ngn(tot.net)}</b></div>
      </div>
      <button className="btn block" disabled={!f.client.trim() || !f.desc.trim()} onClick={submit}>Issue invoice</button>
    </Modal>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const data = useData(s => s.data);
  const branches = data.branches.filter(b => b.tenantId === ctx.tenantId);
  const [f, setF] = useState({ title: '', category: 'Hardware', amount: 250000, branchId: branches[0]?.id ?? '' });
  return (
    <Modal open onClose={onClose} title="Record an expense">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>What was spent?</label>
          <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Replacement UPS batteries — Surulere branch" autoFocus /></div>
        <div className="field"><label>Category</label>
          <select className="select" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {['Hardware', 'Software & subscriptions', 'Internet & data', 'Power & fuel', 'Repairs', 'Logging & travel', 'Other'].map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label>Amount (₦)</label><input className="input" type="number" value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} /></div>
      </div>
      <button className="btn block" disabled={f.title.trim().length < 4 || f.amount <= 0}
        onClick={() => { createExpense(ctx, { title: f.title.trim(), category: f.category, amount: f.amount, branchId: f.branchId || undefined }); toast('Expense recorded'); onClose(); }}>
        Record expense
      </button>
    </Modal>
  );
}

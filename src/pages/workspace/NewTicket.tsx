/** New ticket — impact×urgency preview, live KB deflection, branch/asset pickers. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { createTicket } from '../../platform/db';
import { priorityFrom } from '../../platform/sla';
import { suggestArticles } from '../../platform/ai';
import { Badge, PageHead, StatusBadge, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { TicketKind, ImpactUrgency } from '../../platform/types';

const CATEGORIES = ['Network & connectivity', 'Hardware', 'Software & accounts', 'Printing', 'Email & collaboration', 'Security', 'Power & UPS', 'AV & classroom', 'Access control', 'Other'];
const KINDS: [TicketKind, string][] = [
  ['incident', 'Something is broken'],
  ['request', 'I need something (access, equipment…)'],
  ['change', 'Change to a system or config'],
  ['problem', 'Recurring root-cause investigation'],
];

export default function NewTicket() {
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const [form, setForm] = useState<{ kind: TicketKind; title: string; description: string; category: string; impact: ImpactUrgency; urgency: ImpactUrgency; branchId: string; assetId: string }>({
    kind: 'incident', title: '', description: '', category: 'Hardware',
    impact: 'medium', urgency: 'medium', branchId: '', assetId: '',
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const priority = priorityFrom(form.impact, form.urgency);
  const branches = data.branches.filter(b => b.tenantId === tenant.id);
  const assets = data.assets.filter(a => a.tenantId === tenant.id && a.lifecycle === 'in_service');
  const suggestions = useMemo(
    () => (form.title.trim().length > 6 ? suggestArticles(data, tenant.id, form.title + ' ' + form.description).slice(0, 3) : []),
    [data, tenant.id, form.title, form.description],
  );

  const submit = () => {
    const id = createTicket(ctx, {
      kind: form.kind, title: form.title.trim(), description: form.description.trim(), category: form.category,
      impact: form.impact, urgency: form.urgency,
      branchId: form.branchId || undefined, assetId: form.assetId || undefined, source: 'portal',
    });
    toast('Ticket opened — SLA clock started');
    navigate(`/app/service-desk/${id}`);
  };

  const valid = form.title.trim().length >= 6 && form.description.trim().length >= 10;

  return (
    <div style={{ maxWidth: 860 }}>
      <PageHead crumbs={[tenant.name, 'Service desk', 'New ticket']} title="What do you need help with?"
        sub="Clear titles get faster fixes. The right impact & urgency set the SLA clock." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(260px,1fr)' }}>
        <div className="card pad-lg stack">
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {KINDS.map(([k, label]) => (
              <button key={k} aria-pressed={form.kind === k} onClick={() => set('kind')(k)} style={{ flex: '1 1 40%' }} title={label}>{k}</button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="nt-title">Title</label>
            <input id="nt-title" className="input" value={form.title} onChange={e => set('title')(e.target.value)}
              placeholder="e.g. Lab 3 projector not displaying" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="nt-desc">What’s happening?</label>
            <textarea id="nt-desc" className="textarea" value={form.description} onChange={e => set('description')(e.target.value)}
              placeholder="Steps, error messages, when it started…" />
          </div>
          <div className="form-grid">
            <div className="field"><label>Category</label>
              <select className="select" value={form.category} onChange={e => set('category')(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Branch</label>
              <select className="select" value={form.branchId} onChange={e => set('branchId')(e.target.value)}>
                <option value="">—</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div className="field"><label>Related asset (optional)</label>
              <select className="select" value={form.assetId} onChange={e => set('assetId')(e.target.value)}>
                <option value="">—</option>
                {assets.slice(0, 40).map(a => <option key={a.id} value={a.id}>{a.tag} · {a.name}</option>)}
              </select></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Impact — how wide is the blast?</label>
              <select className="select" value={form.impact} onChange={e => set('impact')(e.target.value)}>
                <option value="low">Low — just me</option>
                <option value="medium">Medium — a team or class</option>
                <option value="high">High — whole site / business</option>
              </select></div>
            <div className="field"><label>Urgency — how soon must it be fixed?</label>
              <select className="select" value={form.urgency} onChange={e => set('urgency')(e.target.value)}>
                <option value="low">Low — this week</option>
                <option value="medium">Medium — today</option>
                <option value="high">High — right now</option>
              </select></div>
          </div>
          <div className="row between">
            <span className="sm muted">Computed priority: <StatusBadge s={priority} /></span>
            <button className="btn" disabled={!valid} onClick={submit}><Icon name="send" size={14} /> Open ticket</button>
          </div>
        </div>

        <div className="stack">
          {!tenant && null}
          {ctx.delegated === true && <div className="note info">You are working as delegated provider staff for this workspace.</div>}
          {suggestions.length > 0 && (
            <div className="card pad-lg stack">
              <div className="lbl">Before you send — did this help?</div>
              {suggestions.map(a => (
                <a key={a.id} href={`/app/docs#${a.id}`} className="card flat card-tight" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <b className="sm">{a.title}</b>
                  <p className="xs muted clamp2" style={{ marginTop: 3 }}>{a.body.slice(0, 120)}…</p>
                </a>
              ))}
              <p className="xs faint">Assistant-matched knowledge base articles.</p>
            </div>
          )}
          <div className="card flat pad-lg stack">
            <div className="lbl">What the SLA clock means</div>
            {(['critical', 'high', 'medium', 'low'] as const).map(p => (
              <div key={p} className="row between sm">
                <StatusBadge s={p} />
                <span className="muted xs">
                  {p === 'critical' ? '4 business-hours to resolve' : p === 'high' ? '8 bh' : p === 'medium' ? '2 business days' : '5 business days'}
                </span>
              </div>
            ))}
            <p className="xs muted">Clocks run on your organisation’s working calendar (WAT, holidays included), not wall-clock hours. <Badge tone="outline">business time</Badge></p>
          </div>
        </div>
      </div>
    </div>
  );
}

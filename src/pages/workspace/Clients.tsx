/** Clients — provider CRM: client workspaces, agreements, contacts, onboard flow. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { onboardClient } from '../../platform/actions';
import { Badge, Empty, Modal, PageHead, StatusBadge, Table, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { daysUntil, NIGERIAN_CITIES, ngn } from '../../platform/util';

export default function Clients() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isProvider = tenant.type === 'service_provider';
  const clients = useMemo(() => data.tenants.filter(t => t.providerId === ctx.tenantId), [data.tenants, ctx.tenantId]);
  const agreements = data.agreements.filter(a => a.tenantId === ctx.tenantId);
  const contacts = data.contacts.filter(c => c.tenantId === ctx.tenantId);

  if (!isProvider) {
    // organisations see their agreements as a buyer
    const mine = data.agreements.filter(a => a.clientTenantId === ctx.tenantId);
    return (
      <div className="stack">
        <PageHead crumbs={[tenant.name, 'Agreements']} title="Service agreements"
          sub="What your service provider is accountable for." />
        {mine.length === 0
          ? <Empty icon="clients" title="No agreements on record" hint="This workspace is self-managed. Service providers track your agreements in their console." />
          : (
            <Table head={['Agreement', 'Provider', 'Tier', 'Monthly fee', 'Renews', 'Status']}>
              {mine.map(a => {
                const provider = data.tenants.find(t => t.id === a.tenantId);
                return (
                  <tr key={a.id}>
                    <td className="b sm">{a.name}</td>
                    <td className="sm">{provider?.name ?? '—'}</td>
                    <td><Badge tone="accent">{a.tier}</Badge></td>
                    <td className="num">{ngn(a.monthlyFee)}</td>
                    <td className="sm">{new Date(a.renewsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} <span className={`xs ${daysUntil(a.renewsAt) < 30 ? '' : 'faint'}`} style={daysUntil(a.renewsAt) < 30 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>({daysUntil(a.renewsAt)}d)</span></td>
                    <td><StatusBadge s={a.status} /></td>
                  </tr>
                );
              })}
            </Table>
          )}
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Clients']} title="Clients & agreements"
        sub={`${clients.length} client organisations · ${agreements.filter(a => a.status === 'active').length} active agreements`}
        actions={can('clients.client.manage') ? <button className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> Onboard client</button> : undefined} />

      {clients.length === 0 ? (
        <Empty icon="clients" title="No clients yet" hint="Onboard your first client to start delivering services."
          action={can('clients.client.manage') ? <button className="btn" onClick={() => setOpen(true)}>Onboard a client</button> : undefined} />
      ) : (
        <div className="grid-3">
          {clients.map(c => {
            const agr = agreements.find(a => a.clientTenantId === c.id && a.status !== 'expired');
            const openTickets = data.tickets.filter(t => t.tenantId === c.id && !['closed', 'resolved'].includes(t.status)).length;
            const anAssets = data.assets.filter(a => a.tenantId === c.id).length;
            return (
              <button key={c.id} className="card pad-lg stack" style={{ textAlign: 'left', gap: 10, cursor: 'pointer' }}
                onClick={() => navigate(`/app/clients/${c.id}`)}>
                <div className="row between">
                  <span className="avatar" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }}>{c.name.slice(0, 2).toUpperCase()}</span>
                  <StatusBadge s={c.status} />
                </div>
                <div>
                  <b style={{ fontSize: 15.5 }}>{c.name}</b>
                  <div className="xs muted">{c.industry} · {c.city}</div>
                </div>
                {agr ? (
                  <div className="row between sm">
                    <Badge tone="accent">{agr.tier} — {ngn(agr.monthlyFee)}/mo</Badge>
                    <span className={`xs ${daysUntil(agr.renewsAt) < 30 ? '' : 'faint'}`} style={daysUntil(agr.renewsAt) < 30 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                      renews in {daysUntil(agr.renewsAt)}d
                    </span>
                  </div>
                ) : <p className="xs muted">No active agreement</p>}
                <div className="xs faint">{openTickets} open tickets · {anAssets} assets · {contacts.filter(x => x.tenantId === ctx.tenantId && x.clientTenantId === c.id).length} contacts</div>
              </button>
            );
          })}
        </div>
      )}

      {contacts.length > 0 && (
        <div className="card pad-lg stack">
          <h3>Key contacts</h3>
          <Table head={['Name', 'Role', 'Client', 'Email', 'Phone']}>
            {contacts.map(c => (
              <tr key={c.id}>
                <td className="b sm">{c.name}</td>
                <td className="sm">{c.role}</td>
                <td className="sm">{data.tenants.find(t => t.id === c.clientTenantId)?.name ?? '—'}</td>
                <td className="sm">{c.email}</td>
                <td className="sm mono">{c.phone}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <OnboardModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function OnboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ name: '', industry: 'Education', city: 'Lagos', contactName: '', contactEmail: '', tier: 'Managed' as 'Essential' | 'Managed' | 'Premium', monthlyFee: 250_000 });
  const submit = async () => {
    const id = await onboardClient(ctx, { ...f, name: f.name.trim(), contactName: f.contactName.trim(), contactEmail: f.contactEmail.trim() });
    toast('Client workspace provisioned with its own SLA policy');
    onClose();
    void id;
  };
  return (
    <Modal open={open} onClose={onClose} title="Onboard a client">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Client organisation</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Riverside Hospital" autoFocus /></div>
        <div className="field"><label>Industry</label>
          <select className="select" value={f.industry} onChange={e => setF({ ...f, industry: e.target.value })}>
            {['Education', 'Healthcare', 'Hospitality', 'Financial services', 'Logistics', 'Retail', 'Energy', 'Non-profit'].map(i => <option key={i}>{i}</option>)}
          </select></div>
        <div className="field"><label>City</label>
          <select className="select" value={f.city} onChange={e => setF({ ...f, city: e.target.value })}>{NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Primary contact</label><input className="input" value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} placeholder="Mrs Onyeka Eze" /></div>
        <div className="field"><label>Contact email</label><input className="input" type="email" value={f.contactEmail} onChange={e => setF({ ...f, contactEmail: e.target.value })} /></div>
      </div>
      <div className="divider" style={{ margin: '4px 0' }} />
      <div className="lbl">Service agreement</div>
      <div className="form-grid">
        <div className="field"><label>Tier</label>
          <select className="select" value={f.tier} onChange={e => setF({ ...f, tier: e.target.value as typeof f.tier })}>{['Essential', 'Managed', 'Premium'].map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Monthly fee (₦)</label><input className="input" type="number" value={f.monthlyFee} onChange={e => setF({ ...f, monthlyFee: +e.target.value })} /></div>
      </div>
      <button className="btn block" disabled={f.name.trim().length < 3 || !f.contactEmail.includes('@')} onClick={submit}>
        Provision client workspace
      </button>
      <p className="hint" style={{ margin: 0, textAlign: 'center' }}>Creates an isolated tenant with starter SLA policy + an agreement record. You switch into it from the workspace menu.</p>
    </Modal>
  );
}

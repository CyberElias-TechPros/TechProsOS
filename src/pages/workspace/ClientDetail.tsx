/** Client detail (provider console) — health of one client workspace at a glance. */
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { itsmStats, slaCompliance, workCalFor } from '../../platform/metrics';
import { fleetHealth } from '../../platform/metrics';
import { Badge, Empty, KV, PageHead, StatusBadge } from '../../components/ui';
import { daysUntil, fmtDate, ngn } from '../../platform/util';
import { Icon } from '../../components/icons';

export default function ClientDetail() {
  const { id } = useParams();
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);

  const client = data.tenants.find(t => t.id === id && t.providerId === ctx.tenantId);
  const tickets = useMemo(() => data.tickets.filter(t => t.tenantId === id), [data.tickets, id]);
  if (!client) return <Empty icon="clients" title="Client not found" action={<Link to="/app/clients" className="btn secondary">Back to clients</Link>} />;

  const stats = itsmStats(tickets);
  const sla = slaCompliance(tickets, workCalFor(data, client.id)).compliance;
  const devices = data.devices.filter(d => d.tenantId === client.id);
  const health = fleetHealth(devices.filter(d => d.monitored));
  const agreement = data.agreements.find(a => a.clientTenantId === client.id && a.status !== 'expired');
  const contacts = data.contacts.filter(c => c.clientTenantId === client.id);
  const projects = data.projects.filter(p => p.clientTenantId === client.id && p.status !== 'completed');
  const recent = tickets.slice(0, 6);
  void tenant;

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Clients', client.name]} title={client.name}
        sub={`${client.industry} · ${client.city}`} />

      <div className="grid-4">
        <div className="card kpi"><span className="k-label">Open tickets</span><span className="k-value">{stats.open}</span><span className="k-sub">{stats.criticalOpen} critical</span></div>
        <div className="card kpi"><span className="k-label">SLA compliance</span><span className="k-value">{sla == null ? '—' : `${sla}%`}</span><span className="k-sub">business-hours based</span></div>
        <div className="card kpi"><span className="k-label">Monitored estate</span><span className="k-value">{health.availabilityPct ?? '—'}%</span><span className="k-sub">{devices.length} devices</span></div>
        <div className="card kpi"><span className="k-label">Agreement value</span><span className="k-value">{agreement ? ngn(agreement.monthlyFee, { compact: true }) : '—'}</span><span className="k-sub">per month</span></div>
      </div>

      <div className="grid-2">
        <div className="card pad-lg stack">
          <h3>Agreement</h3>
          {agreement ? (
            <KV items={[
              ['Name', agreement.name],
              ['Tier', <Badge tone="accent">{agreement.tier}</Badge>],
              ['Monthly fee', ngn(agreement.monthlyFee)],
              ['Started', fmtDate(agreement.startsAt)],
              ['Renews', `${fmtDate(agreement.renewsAt)} (${daysUntil(agreement.renewsAt)} days)`],
              ['Status', <StatusBadge s={agreement.status} />],
            ]} />
          ) : <p className="muted sm">No agreement on file — create one to make SLAs visible.</p>}
          {projects.length > 0 && (
            <>
              <div className="lbl" style={{ marginTop: 6 }}>Active deliveries</div>
              {projects.map(p => (
                <Link key={p.id} to={`/app/projects/${p.id}`} className="row between sm" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span>{p.name}</span><StatusBadge s={p.status} />
                </Link>
              ))}
            </>
          )}
        </div>
        <div className="card pad-lg stack">
          <h3>Contacts</h3>
          {contacts.length === 0 && <p className="muted sm">No contacts recorded for this client.</p>}
          {contacts.map(c => (
            <div key={c.id} className="row between sm">
              <span><b>{c.name}</b> <span className="muted">— {c.role}</span></span>
              <span className="mono xs faint">{c.phone}</span>
            </div>
          ))}
          <div className="lbl" style={{ marginTop: 6 }}>Recent tickets</div>
          {recent.map(t => (
            <Link key={t.id} to={`/app/service-desk/${t.id}`} className="row between sm" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="ellipsis" style={{ minWidth: 0 }}><span className="mono xs faint">{t.number}</span> {t.title}</span>
              <StatusBadge s={t.status} />
            </Link>
          ))}
        </div>
      </div>
      <div className="note info">
        <Icon name="lock" size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        Delegated access: work inside this client’s workspace directly by switching from the workspace menu. The ticket scope and permissions travel with you.
      </div>
    </div>
  );
}

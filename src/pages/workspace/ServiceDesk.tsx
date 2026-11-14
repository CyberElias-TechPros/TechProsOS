/** Service Desk — permission-scoped queue with SLA heat, saved-view chips, bulk ops. */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { visibleTickets, slaBadgeState } from '../../platform/metrics';
import { assignTicket } from '../../platform/actions';
import { tenantUsers } from '../../platform/db';
import type { Ticket } from '../../platform/types';
import { Badge, Empty, PageHead, StatusBadge, Table, Tabs, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDuration, fmtTimeAgo } from '../../platform/util';
import { branchName, userName } from './lookups';

const QUEUE_TABS: [string, string][] = [
  ['all', 'All open'], ['new', 'Needs triage'], ['mine', 'Mine'], ['unassigned', 'Unassigned'], ['sla', 'SLA risk'], ['resolved', 'Resolved'],
];

function SlaCell({ t }: { t: Ticket }) {
  const state = slaBadgeState(t);
  if (!t.resolveDueAt) return <span className="faint sm">—</span>;
  const due = new Date(t.resolveDueAt).getTime();
  const left = due - Date.now();
  if (state === 'met') return <Badge tone="ok">Met</Badge>;
  if (state === 'breached') return <Badge tone="critical" pulse>Breached</Badge>;
  if (left < 60 * 60 * 1000) return <Badge tone="warn" pulse>{fmtDuration(left)}</Badge>;
  return <Badge tone="outline">{fmtDuration(left)}</Badge>;
}

export default function ServiceDesk() {
  const { ctx, user, can, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('q') ?? 'all';
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [branch, setBranch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const scoped = useMemo(() => visibleTickets(data, ctx), [data, ctx]);
  const staff = useMemo(() => {
    const users = tenantUsers(data, ctx.tenantId);
    const roleOf = (id: string) => data.memberships.find(m => m.userId === id && m.tenantId === ctx.tenantId)?.role;
    return users.filter(u => roleOf(u.id) !== 'employee');
  }, [data, ctx.tenantId]);

  const queue = useMemo(() => {
    let xs = scoped;
    if (tab === 'mine') xs = xs.filter(x => x.assigneeId === user.id && x.status !== 'closed');
    else if (tab === 'new') xs = xs.filter(x => x.status === 'new' || x.status === 'triaged');
    else if (tab === 'unassigned') xs = xs.filter(x => !x.assigneeId && x.status !== 'closed' && x.status !== 'resolved');
    else if (tab === 'sla') xs = xs.filter(x => ['breached', 'at_risk'].includes(slaBadgeState(x)));
    else if (tab === 'resolved') xs = xs.filter(x => x.status === 'resolved' || x.status === 'closed');
    else xs = xs.filter(x => x.status !== 'closed' && x.status !== 'resolved');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      xs = xs.filter(x => `${x.number} ${x.title} ${userName(data, x.requesterId)}`.toLowerCase().includes(q));
    }
    if (cat) xs = xs.filter(x => x.category === cat);
    if (branch) xs = xs.filter(x => x.branchId === branch);
    return xs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [scoped, tab, search, cat, branch, data, user.id]);

  const categories = useMemo(() => [...new Set(scoped.map(x => x.category))].sort(), [scoped]);
  const branches = data.branches.filter(b => b.tenantId === ctx.tenantId);

  const bulkAssign = async (assigneeId: string) => {
    for (const id of selected) { try { await assignTicket(ctx, id, assigneeId); } catch (e) { toast((e as Error).message, 'bad'); } }
    setSelected([]);
    toast(`${selected.length} ticket${selected.length > 1 ? 's' : ''} assigned to ${userName(data, assigneeId)}`);
  };

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Service desk']} title="Service desk"
        sub="Every request, incident and change — scoped to the work you’re accountable for."
        actions={
          <button className="btn" onClick={() => navigate('/app/service-desk/new')}><Icon name="plus" size={14} /> New ticket</button>
        } />

      <div className="card pad-lg stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '0 1 300px' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder="Search code, title, requester…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search tickets" />
          </div>
          <select className="select" style={{ maxWidth: 190 }} value={cat} onChange={e => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 170 }} value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            <option value="">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selected.length > 0 && can('itsm.ticket.assign') && (
            <select className="select" style={{ maxWidth: 200 }} value="" onChange={e => e.target.value && bulkAssign(e.target.value)} aria-label="Assign selected">
              <option value="">Assign {selected.length}…</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
        <Tabs tabs={QUEUE_TABS} value={tab} onChange={v => setParams({ q: v })} />
      </div>

      {queue.length === 0 ? (
        <Empty icon="tickets" title="This queue is empty"
          hint={tab === 'sla' ? 'Nothing is at risk of breaching SLA right now. Good shift.' : 'No tickets match the current filters.'} />
      ) : (
        <Table head={can('itsm.ticket.assign') ? ['', 'Ticket', 'Priority', 'Status', 'Requester', 'Assignee', 'Branch', 'SLA', ''] : ['Ticket', 'Priority', 'Status', 'Requester', 'Assignee', 'Branch', 'SLA', '']}>
          {queue.map(x => (
            <tr key={x.id} className="clickable" onClick={() => navigate(`/app/service-desk/${x.id}`)}>
              {can('itsm.ticket.assign') && (
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${x.number}`} checked={selected.includes(x.id)}
                    onChange={e => setSelected(s => e.target.checked ? [...s, x.id] : s.filter(id => id !== x.id))} />
                </td>
              )}
              <td style={{ minWidth: 240 }}>
                <div className="row nowrap" style={{ gap: 8 }}>
                  <span className="mono xs faint">{x.number}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="b sm ellipsis" style={{ maxWidth: 300 }}>{x.title}</div>
                    <div className="xs muted">{x.category} · {fmtTimeAgo(x.createdAt)}</div>
                  </div>
                </div>
              </td>
              <td><StatusBadge s={x.priority} /></td>
              <td><StatusBadge s={x.status} /></td>
              <td className="sm">{userName(data, x.requesterId)}</td>
              <td className="sm">{x.assigneeId ? userName(data, x.assigneeId) : <span className="faint">Unassigned</span>}</td>
              <td className="sm">{branchName(data, x.branchId)}</td>
              <td><SlaCell t={x} /></td>
              <td><Icon name="chevronR" size={14} style={{ color: 'var(--faint)' }} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

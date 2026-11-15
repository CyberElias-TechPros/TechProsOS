/** Ticket detail — thread, internal notes, SLA panel, actions (assign/status/rate). */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { visibleTickets, slaBadgeState } from '../../platform/metrics';
import { addTicketMessage, assignTicket, rateTicket, setTicketStatus } from '../../platform/actions';
import { tenantUsers } from '../../platform/db';
import type { TicketStatus } from '../../platform/types';
import { Badge, KV, PageHead, StatusBadge, toast, UserAvatar, Empty } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDuration, fmtDateTime, fmtTimeAgo } from '../../platform/util';
import { assetLabel, branchName, userName } from './lookups';
import { ROLE_LABELS } from '../../platform/permissions';
import { AttachmentPanel } from './AttachmentPanel';

const NEXT_STEPS: Record<TicketStatus, TicketStatus[]> = {
  new: ['triaged', 'assigned', 'closed'],
  triaged: ['assigned', 'in_progress', 'pending', 'closed'],
  assigned: ['in_progress', 'pending', 'resolved'],
  in_progress: ['pending', 'resolved', 'closed'],
  pending: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: [],
};

export default function TicketDetail() {
  const { id } = useParams();
  const { ctx, user, can, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);

  const scoped = useMemo(() => visibleTickets(data, ctx), [data, ctx]);
  const ticket = scoped.find(x => x.id === id);
  if (!ticket) {
    return <Empty icon="tickets" title="Ticket not found — or outside your scope"
      hint="It may belong to another workspace or your role only sees your own tickets."
      action={<Link className="btn secondary" to="/app/service-desk">Back to queue</Link>} />;
  }

  const thread = data.ticketMessages.filter(m => m.ticketId === ticket.id);
  const history = data.auditLogs.filter(a => a.entity === 'ticket' && a.entityId === ticket.id).slice(0, 12);
  const staff = tenantUsers(data, ctx.tenantId).filter(u =>
    (data.memberships.find(m => m.userId === u.id && m.tenantId === ctx.tenantId)?.role ?? 'employee') !== 'employee');
  const sla = slaBadgeState(ticket);
  const isOpen = !['closed'].includes(ticket.status);

  const doStatus = async (status: TicketStatus) => {
    try { await setTicketStatus(ctx, ticket.id, status); toast(`Marked ${status.replace(/_/g, ' ')}`); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };
  const send = async () => {
    if (!draft.trim()) return;
    await addTicketMessage(ctx, ticket.id, draft.trim(), internal && can('itsm.ticket.update'));
    setDraft('');
  };

  return (
    <div className="stack">
      <PageHead
        crumbs={[tenant.name, 'Service desk', ticket.number]}
        title={ticket.title}
        actions={
          <div className="row">
            {can('itsm.ticket.assign') && (
              <select className="select" style={{ width: 170 }} value={ticket.assigneeId ?? ''} aria-label="Assign to"
                onChange={async e => { if (e.target.value) { await assignTicket(ctx, ticket.id, e.target.value); toast(`Assigned to ${userName(data, e.target.value)}`); } }}>
                <option value="">Unassigned</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <Link to="/app/service-desk" className="btn ghost"><Icon name="chevronL" size={14} /> Queue</Link>
          </div>
        } />

      <div className="row" style={{ gap: 8 }}>
        <StatusBadge s={ticket.status} />
        <StatusBadge s={ticket.priority} />
        <Badge tone="outline">{ticket.kind}</Badge>
        <Badge tone="outline">{ticket.category}</Badge>
        {ticket.source === 'monitoring' && <Badge tone="violet">from monitoring</Badge>}
        {sla === 'breached' && <Badge tone="critical" pulse>SLA breached</Badge>}
        {sla === 'at_risk' && <Badge tone="warn" pulse>SLA at risk</Badge>}
        {sla === 'met' && (ticket.resolvedAt || ticket.closedAt) && <Badge tone="ok">SLA met</Badge>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 1fr)' }}>
        <div className="stack">
          <div className="card pad-lg stack">
            <h3>Summary</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
            {ticket.resolutionSummary && <div className="note ok">Resolution: {ticket.resolutionSummary}</div>}
          </div>

          <div className="card pad-lg stack">
            <h3>Conversation</h3>
            {thread.length === 0 && <p className="muted sm">No messages yet.</p>}
            {thread.map(m => (
              <div key={m.id} className="row nowrap" style={{ alignItems: 'flex-start', gap: 10 }}>
                <UserAvatar name={userName(data, m.authorId)} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row sm" style={{ gap: 8 }}>
                    <b>{userName(data, m.authorId)}</b>
                    {m.internal && <Badge tone="violet">internal note</Badge>}
                    <span className="xs faint">{fmtTimeAgo(m.createdAt)}</span>
                  </div>
                  <p className="sm" style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
                </div>
              </div>
            ))}
            {isOpen && (
              <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <textarea className="textarea" placeholder={internal ? 'Internal note (staff only)…' : 'Reply to the requester…'}
                  value={draft} onChange={e => setDraft(e.target.value)} aria-label="Message" />
                <div className="row between">
                  {can('itsm.ticket.update') ? (
                    <label className="check-row sm muted">
                      <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Internal note
                    </label>
                  ) : <span />}
                  <button className="btn sm" onClick={send} disabled={!draft.trim()}><Icon name="send" size={13} /> Send</button>
                </div>
              </div>
            )}
          </div>

          {ticket.status === 'resolved' && ticket.requesterId === user.id && !ticket.csat && (
            <div className="card pad-lg stack" style={{ borderColor: 'var(--accent)' }}>
              <h3>How did we do?</h3>
              <p className="muted sm">Rate this resolution — it feeds the CSAT score on your reports.</p>
              <div className="row">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} className="btn secondary" onClick={async () => { await rateTicket(ctx, ticket.id, n); toast('Thanks for the feedback'); }}>
                    {n} ★
                  </button>
                ))}
              </div>
            </div>
          )}
          {ticket.csat && <div className="note ok">Rated {ticket.csat}/5 by the requester. Thank you.</div>}
        </div>

        <div className="stack">
          {isOpen && NEXT_STEPS[ticket.status].length > 0 && (
            <div className="card pad-lg stack">
              <div className="lbl">Next steps</div>
              {NEXT_STEPS[ticket.status].map(s => (
                <button key={s} className="btn secondary block" style={{ justifyContent: 'flex-start' }} onClick={() => doStatus(s)}>
                  <Icon name="arrowRight" size={13} /> Mark {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
          <div className="card pad-lg">
            <KV items={[
              ['Number', <span className="mono">{ticket.number}</span>],
              ['Requester', userName(data, ticket.requesterId)],
              ['Assignee', ticket.assigneeId ? userName(data, ticket.assigneeId) : 'Unassigned'],
              ['Branch', branchName(data, ticket.branchId)],
              ['Asset', assetLabel(data, ticket.assetId)],
              ['Impact / urgency', `${ticket.impact} / ${ticket.urgency}`],
              ['Opened', fmtDateTime(ticket.createdAt)],
              ['Response due', ticket.responseDueAt ? fmtDateTime(ticket.responseDueAt) : '—'],
              ['Resolve due', ticket.resolveDueAt ? <span>{fmtDateTime(ticket.resolveDueAt)} <span className="xs faint">({fmtDuration(new Date(ticket.resolveDueAt).getTime() - Date.now())} left)</span></span> : '—'],
              ['Resolved', ticket.resolvedAt ? fmtDateTime(ticket.resolvedAt) : '—'],
            ]} />
          </div>
          <AttachmentPanel entityId={ticket.id} canUpload={isOpen && (can('itsm.ticket.update') || ticket.requesterId === user.id)} canManage={can('itsm.ticket.update')} />
          {history.length > 0 && (
            <div className="card pad-lg stack">
              <div className="lbl">Audit trail</div>
              {history.map(h => (
                <div key={h.id} className="timeline-item">
                  <span className="t-dot" />
                  <span><b className="sm">{h.summary}</b><br /><span className="xs faint">{h.actorName} · {fmtTimeAgo(h.at)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="xs faint">Role here: {ROLE_LABELS[ctx.role]} · {can('itsm.ticket.close') ? 'you can close tickets' : 'read/reply scope'}</p>
    </div>
  );
}

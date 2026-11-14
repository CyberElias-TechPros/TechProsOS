/** Notification centre — every event routed to the current user, filterable. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { markNotificationRead } from '../../platform/db';
import { Empty, PageHead } from '../../components/ui';
import { fmtTimeAgo } from '../../platform/util';
import { Icon } from '../../components/icons';

export default function NotificationsPage() {
  const { user, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const mine = useMemo(() => data.notifications
    .filter(n => n.userId === user.id && n.tenantId === tenant.id)
    .sort((a, b) => b.at.localeCompare(a.at)), [data.notifications, user.id, tenant.id]);
  const unread = mine.filter(n => !n.read).length;
  const [show, setShow] = useState<'all' | 'unread'>('all');
  const list = show === 'unread' ? mine.filter(n => !n.read) : mine;

  return (
    <div style={{ maxWidth: 720 }} className="stack">
      <PageHead crumbs={[tenant.name, 'Notifications']} title="Your notifications"
        sub={`${unread} unread · routed from tickets, alerts, approvals and system events`}
        actions={unread > 0 ? <button className="btn secondary sm" onClick={() => markNotificationRead(tenant.id, user.id)}>Mark all read</button> : undefined} />
      <div className="seg">
        <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>All</button>
        <button aria-pressed={show === 'unread'} onClick={() => setShow('unread')}>Unread ({unread})</button>
      </div>
      {list.length === 0 ? <Empty icon="bell" title="All caught up" hint="Assignments, alerts and mentions will land here." /> : (
        <div className="stack" style={{ gap: 6 }}>
          {list.map(n => (
            <button key={n.id} className={`card card-tight row nowrap`} style={{
              textAlign: 'left', cursor: 'pointer', gap: 12, alignItems: 'flex-start',
              background: n.read ? 'var(--surface)' : 'var(--accent-soft)', border: '1px solid var(--line)', width: '100%',
            }} onClick={() => { markNotificationRead(tenant.id, user.id, n.id); if (n.link) navigate(n.link); }}>
              <span className="glyph" style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--muted)', flex: 'none' }}>
                <Icon name="bell" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="b sm">{n.title}</div>
                <div className="sm muted">{n.body}</div>
                <div className="xs faint" style={{ marginTop: 3 }}>{fmtTimeAgo(n.at)}</div>
              </span>
              {!n.read && <span className="status-dot" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

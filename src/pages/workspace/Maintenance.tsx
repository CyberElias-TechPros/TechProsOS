/** Maintenance — preventive plans + field work orders with checklists. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { runMaintenanceScheduler, toggleChecklistItem, updateWorkOrderStatus } from '../../platform/actions';
import { tenantUsers } from '../../platform/db';
import { Badge, Empty, PageHead, StatusBadge, Table, Tabs, toast, UserAvatar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { DAYS, fmtDate, fmtTimeAgo } from '../../platform/util';
import { assetLabel, branchName, userName } from './lookups';

export default function Maintenance() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('workorders');

  const plans = data.maintenancePlans.filter(p => p.tenantId === ctx.tenantId);
  const orders = data.workOrders.filter(w => w.tenantId === ctx.tenantId);
  const staff = tenantUsers(data, ctx.tenantId);

  const byStatus = useMemo(() => ({
    open: orders.filter(o => o.status === 'open').length,
    scheduled: orders.filter(o => o.status === 'scheduled').length,
    in_progress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
  }), [orders]);

  const dueSoon = plans.filter(p => p.active && new Date(p.nextRunAt).getTime() - Date.now() < 14 * DAYS);

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Maintenance']} title="Maintenance & field service"
        sub={`${byStatus.open} open · ${byStatus.scheduled} scheduled · ${byStatus.in_progress} in progress · ${byStatus.completed} completed`}
        actions={can('maintenance.plan.manage') ? (
          <button className="btn secondary" onClick={async () => { const n = await runMaintenanceScheduler(ctx); toast(n ? `${n} work order${n > 1 ? 's' : ''} generated from due plans` : 'No plans due right now', n ? 'ok' : 'info'); }}>
            <Icon name="refresh" size={14} /> Run plan scheduler
          </button>
        ) : undefined} />

      <div className="card pad-lg stack">
        <Tabs tabs={[['workorders', `Work orders (${orders.length})`], ['plans', `Preventive plans (${plans.length})`]]} value={tab} onChange={setTab} />
      </div>

      {tab === 'workorders' && (
        orders.length === 0 ? <Empty icon="maintenance" title="No work orders" hint="Raise one from an asset page or wait for a preventive plan to come due." /> : (
          <div className="stack">
            {orders.map(w => {
              const overdue = new Date(w.dueAt).getTime() < Date.now() && !['completed', 'cancelled'].includes(w.status);
              return (
                <div key={w.id} className="card pad-lg stack">
                  <div className="row between">
                    <span className="row nowrap" style={{ gap: 10, minWidth: 0 }}>
                      <span className="mono xs faint">{w.number}</span>
                      <div style={{ minWidth: 0 }}>
                        <b className="sm">{w.title}</b>
                        <div className="xs muted">{w.kind === 'preventive' ? 'Preventive' : 'Corrective'} · {w.assetId ? assetLabel(data, w.assetId) : branchName(data, w.branchId)} · due {fmtDate(w.dueAt)}</div>
                      </div>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      {overdue && <Badge tone="bad" pulse>Overdue</Badge>}
                      <StatusBadge s={w.status} />
                    </span>
                  </div>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <div className="stack" style={{ gap: 6 }}>
                      {w.checklist.map((c, i) => (
                        <label key={i} className="check-row" style={{ fontSize: 13 }}>
                          <input type="checkbox" checked={c.done} disabled={!can('maintenance.workorder.manage')}
                            onChange={async () => await toggleChecklistItem(ctx, w.id, i)} />
                          <span style={c.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{c.item}</span>
                        </label>
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <UserAvatar name={userName(data, w.assigneeId)} size="sm" />
                        <span className="sm">{w.assigneeId ? userName(data, w.assigneeId) : 'Unassigned'}</span>
                      </div>
                      {can('maintenance.workorder.manage') && w.status !== 'completed' && (
                        <div className="row">
                          <select className="select" style={{ maxWidth: 190 }} value={w.assigneeId ?? ''} aria-label="Assign work order"
                            onChange={async e => { if (e.target.value) await updateWorkOrderStatus(ctx, w.id, w.status, { assigneeId: e.target.value }); }}>
                            <option value="">Assign to…</option>
                            {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          {w.status === 'open' && <button className="btn sm secondary" onClick={async () => await updateWorkOrderStatus(ctx, w.id, 'scheduled')}>Schedule</button>}
                          {['open', 'scheduled'].includes(w.status) && <button className="btn sm secondary" onClick={async () => await updateWorkOrderStatus(ctx, w.id, 'in_progress')}>Start</button>}
                          <button className="btn sm" onClick={async () => {
                            const done = w.checklist.filter(c => c.done).length;
                            if (done < w.checklist.length) { toast(`Finish the checklist first (${done}/${w.checklist.length})`, 'bad'); return; }
                            await updateWorkOrderStatus(ctx, w.id, 'completed');
                            toast(`${w.number} completed`);
                          }}>Complete</button>
                        </div>
                      )}
                      {w.completedAt && <div className="xs muted">Completed {fmtTimeAgo(w.completedAt)}{w.cost ? ` · ${w.labourHours ?? 0}h · cost recorded` : ''}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'plans' && (
        <>
          {dueSoon.length > 0 && <div className="note">{dueSoon.length} preventive plan{dueSoon.length > 1 ? 's' : ''} due within 14 days — run the scheduler to raise work orders.</div>}
          {plans.length === 0 ? <Empty icon="calendar" title="No preventive plans yet" /> : (
            <Table head={['Plan', 'Asset category', 'Interval', 'Assignee', 'Next run', 'State']}>
              {plans.map(p => (
                <tr key={p.id}>
                  <td className="b sm">{p.name}</td>
                  <td className="sm">{p.assetCategory}</td>
                  <td className="sm">Every {p.intervalMonths} months</td>
                  <td className="sm">{userName(data, p.assigneeId)}</td>
                  <td className="sm">{fmtDate(p.nextRunAt)}{new Date(p.nextRunAt).getTime() < Date.now() ? ' · ' : ''}{new Date(p.nextRunAt).getTime() < Date.now() && <Badge tone="warn">due</Badge>}</td>
                  <td><StatusBadge s={p.active ? 'active' : 'paused'} /></td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </div>
  );
}

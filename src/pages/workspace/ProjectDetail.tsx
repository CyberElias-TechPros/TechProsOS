/** Project detail — kanban board, milestone stepper, budget burn. */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { addTask, moveTask, setProjectStatus, toggleMilestone } from '../../platform/actions';
import type { TaskColumn } from '../../platform/types';
import { Badge as _Badge, Empty, KV, PageHead, StatusBadge, toast, UserAvatar } from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { daysUntil, fmtDate, ngn, pct } from '../../platform/util';
import { userName } from './lookups';

const COLS: [TaskColumn, string][] = [['backlog', 'Backlog'], ['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']];

export default function ProjectDetail() {
  const { id } = useParams();
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [newTask, setNewTask] = useState('');

  const project = data.projects.find(p => p.id === id && p.tenantId === ctx.tenantId);
  const tasks = useMemo(() => data.tasks.filter(t => t.projectId === id), [data.tasks, id]);

  if (!project) return <Empty icon="projects" title="Project not found" action={<Link to="/app/projects" className="btn secondary">Back to projects</Link>} />;

  const doneMs = project.milestones.filter(m => m.done).length;
  const progress = pct(tasks.filter(t => t.column === 'done').length + doneMs, Math.max(1, tasks.length + project.milestones.length));
  const dLeft = daysUntil(project.dueAt);
  const client = project.clientTenantId ? data.tenants.find(t => t.id === project.clientTenantId) : undefined;
  const editable = can('projects.project.manage');

  const add = async () => {
    if (newTask.trim().length < 3) return;
    await addTask(ctx, project.id, newTask.trim(), 'backlog');
    setNewTask('');
  };

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Projects', project.name]} title={project.name}
        sub={project.description || project.kind}
        actions={
          editable ? (
            <select className="select" style={{ width: 150 }} value={project.status} aria-label="Project status"
              onChange={async e => { await setProjectStatus(ctx, project.id, e.target.value as typeof project.status); toast(`Project ${e.target.value.replace(/_/g, ' ')}`); }}>
              {(['planning', 'in_progress', 'on_hold', 'completed'] as const).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          ) : undefined
        } />

      <div className="grid-4">
        <div className="card kpi"><span className="k-label">Progress</span><span className="k-value">{progress}%</span><span className="k-sub">{tasks.filter(t => t.column === 'done').length}/{tasks.length} tasks</span></div>
        <div className="card kpi"><span className="k-label">Budget used</span><span className="k-value" style={{ color: project.spent > project.budget ? 'var(--bad)' : undefined }}>{pct(project.spent, project.budget || 1)}%</span><span className="k-sub">{ngn(project.spent)} of {ngn(project.budget)}</span></div>
        <div className="card kpi"><span className="k-label">Due</span><span className="k-value" style={dLeft < 7 ? { color: 'var(--warn)' } : undefined}>{dLeft}d</span><span className="k-sub">{fmtDate(project.dueAt)}</span></div>
        <div className="card kpi"><span className="k-label">Milestones</span><span className="k-value">{doneMs}/{project.milestones.length}</span><span className="k-sub">completed</span></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.8fr) minmax(280px,1fr)' }}>
        <div className="card pad-lg stack">
          <div className="row between">
            <h3>Board</h3>
            {editable && (
              <span className="row nowrap">
                <input className="input" style={{ width: 220 }} value={newTask} placeholder="Add a task…" onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} aria-label="New task" />
                <button className="btn sm" onClick={add}><Icon name="plus" size={13} /></button>
              </span>
            )}
          </div>
          <div className="kanban">
            {COLS.map(([col, label]) => (
              <div key={col} className="kb-col">
                <h4>{label} <span className="num">{tasks.filter(t => t.column === col).length}</span></h4>
                {tasks.filter(t => t.column === col).map(t => (
                  <div key={t.id} className="kb-card">
                    <div className="row between" style={{ gap: 6 }}>
                      <span className="b" style={{ minWidth: 0 }}>{t.title}</span>
                      <StatusBadge s={t.priority} />
                    </div>
                    <div className="row between">
                      <span className="row nowrap xs muted">
                        {t.assigneeId ? <UserAvatar name={userName(data, t.assigneeId)} size="sm" /> : null}
                        {t.dueAt ? <span>{fmtDate(t.dueAt)}</span> : <span>no due date</span>}
                      </span>
                      {editable && (
                        <span className="row" style={{ gap: 2 }}>
                          {COLS.map(([c]) => c !== col && (
                            <button key={c} className="icon-btn" style={{ width: 22, height: 22 }} title={`Move to ${c}`}
                              onClick={async () => await moveTask(ctx, t.id, c)}>
                              <Icon name={COLS.findIndex(([x]) => x === c) < COLS.findIndex(([x]) => x === col) ? 'chevronL' as IconName : 'chevronR' as IconName} size={11} />
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card pad-lg stack">
            <h3>Milestones</h3>
            {project.milestones.length === 0 && <p className="muted sm">No milestones defined.</p>}
            {project.milestones.map(m => (
              <div key={m.id} className="row between">
                <label className="check-row" style={{ fontSize: 13.5 }}>
                  <input type="checkbox" checked={m.done} disabled={!editable} onChange={async () => await toggleMilestone(ctx, project.id, m.id)} />
                  <span style={m.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{m.title}</span>
                </label>
                <span className="xs faint">{fmtDate(m.dueAt)}</span>
              </div>
            ))}
          </div>
          <div className="card pad-lg">
            <KV items={[
              ['Kind', project.kind],
              ['Project manager', userName(data, project.managerId)],
              ['Status', <StatusBadge s={project.status} />],
              ['Start', fmtDate(project.startAt)],
              ['Due', `${fmtDate(project.dueAt)} (${dLeft}d)`],
              ['Delivering for', client ? client.name : '— internal —'],
              ['Budget', ngn(project.budget)],
              ['Spent', ngn(project.spent)],
            ]} />
          </div>
        </div>
      </div>
    </div>
  );
}

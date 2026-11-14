/** Projects — portfolio grid with budget bars; detail opens kanban + milestones. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { createProject, tenantUsers } from '../../platform/db';
import { Badge, Modal, PageHead, StatusBadge, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { DAYS, daysUntil, fmtDate, ngn, pct } from '../../platform/util';
import { userName } from './lookups';

export default function Projects() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  const projects = useMemo(() => data.projects.filter(p => p.tenantId === ctx.tenantId), [data.projects, ctx.tenantId]);
  const shown = status ? projects.filter(p => p.status === status) : projects;

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Projects']} title="IT projects & deployments"
        sub="Deployments, migrations and rollouts with budgets and milestone truth."
        actions={can('projects.project.manage') ? <button className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> New project</button> : undefined} />

      <div className="seg">
        {['', 'planning', 'in_progress', 'on_hold', 'completed'].map(s => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s ? s.replace(/_/g, ' ') : 'All'}</button>
        ))}
      </div>

      <div className="grid-3">
        {shown.map(p => {
          const tasks = data.tasks.filter(t => t.projectId === p.id);
          const doneTasks = tasks.filter(t => t.column === 'done').length;
          const doneMs = p.milestones.filter(m => m.done).length;
          const dLeft = daysUntil(p.dueAt);
          const overBudget = p.spent > p.budget;
          return (
            <Link key={p.id} to={`/app/projects/${p.id}`} className="card pad-lg stack" style={{ textDecoration: 'none', color: 'inherit', gap: 10 }}>
              <div className="row between">
                <StatusBadge s={p.status} />
                {p.clientTenantId && <Badge tone="violet">client delivery</Badge>}
              </div>
              <div>
                <b>{p.name}</b>
                <div className="xs muted" style={{ marginTop: 2 }}>{p.kind} · led by {userName(data, p.managerId)}</div>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row between xs"><span className="muted">Progress</span><b className="num">{doneTasks}/{tasks.length} tasks · {doneMs}/{p.milestones.length} milestones</b></div>
                <div className="bar thin"><i style={{ width: `${pct(doneTasks + doneMs, Math.max(1, tasks.length + p.milestones.length))}%` }} /></div>
              </div>
              <div className="row between sm">
                <span className={overBudget ? 'b' : 'muted'} style={overBudget ? { color: 'var(--bad)' } : undefined}>{ngn(p.spent)} spent of {ngn(p.budget)}</span>
                <span className={`xs ${dLeft < 7 ? '' : 'muted'}`} style={dLeft < 7 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{dLeft >= 0 ? `${dLeft}d left` : `${-dLeft}d late`}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {shown.length === 0 && <div className="empty">No projects match this filter.</div>}

      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const staff = tenantUsers(data, ctx.tenantId);
  const clients = data.tenants.filter(t => t.providerId === ctx.tenantId);
  const [f, setF] = useState({ name: '', kind: 'Network deployment', managerId: '', budget: 1_500_000, weeks: 6, description: '', clientTenantId: '' });

  const submit = () => {
    createProject(ctx, {
      name: f.name.trim(), kind: f.kind, managerId: f.managerId || ctx.userId, budget: f.budget,
      dueAt: new Date(Date.now() + f.weeks * 7 * DAYS).toISOString(), description: f.description.trim(),
      clientTenantId: f.clientTenantId || undefined,
    });
    toast('Project created');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Project name</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Campus Wi‑Fi refresh — Phase 2" autoFocus /></div>
        <div className="field"><label>Type</label>
          <select className="select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
            {['Network deployment', 'Migration', 'Security uplift', 'Server refresh', 'Software rollout', 'New site provisioning'].map(k => <option key={k}>{k}</option>)}
          </select></div>
        <div className="field"><label>Project manager</label>
          <select className="select" value={f.managerId} onChange={e => setF({ ...f, managerId: e.target.value })}>
            {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        {tenant.type === 'service_provider' && (
          <div className="field"><label>Delivering for client (optional)</label>
            <select className="select" value={f.clientTenantId} onChange={e => setF({ ...f, clientTenantId: e.target.value })}>
              <option value="">Internal</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        )}
        <div className="field"><label>Budget (₦)</label><input className="input" type="number" value={f.budget} onChange={e => setF({ ...f, budget: +e.target.value })} /></div>
        <div className="field"><label>Duration (weeks)</label><input className="input" type="number" value={f.weeks} onChange={e => setF({ ...f, weeks: +e.target.value })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Scope summary</label>
          <textarea className="textarea" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} style={{ minHeight: 70 }} /></div>
      </div>
      <button className="btn block" disabled={f.name.trim().length < 4} onClick={submit}>Create project — due {fmtDate(new Date(Date.now() + f.weeks * 7 * DAYS).toISOString())}</button>
    </Modal>
  );
}

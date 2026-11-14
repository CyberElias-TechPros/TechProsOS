/** Administration — org profile, branches & departments, users & roles, plan. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { acceptInvitation, changeMemberRole, createBranch, createDepartment, inviteUser, setSubscriptionPlan, tenantUsers, updateTenantProfile } from '../../platform/db';
import { ROLE_LABELS, permissionsForRole } from '../../platform/permissions';
import type { RoleId } from '../../platform/types';
import { Badge, Modal, PageHead, StatusBadge, Table, Tabs, toast, UserAvatar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtTimeAgo, ngn } from '../../platform/util';

const PLAN_PRICE: Record<string, number> = { starter: 19500, professional: 59500, business: 149500, enterprise: 0 };
const USER_ROLES: RoleId[] = ['org_admin', 'it_manager', 'it_technician', 'network_engineer', 'security_officer', 'procurement_officer', 'finance_officer', 'dept_manager', 'employee', 'auditor'];

export default function Admin() {
  const { ctx, tenant, can, user } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('users');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [branchName, setBranchNL] = useState('');

  const users = tenantUsers(data, ctx.tenantId);
  const members = data.memberships.filter(m => m.tenantId === ctx.tenantId && m.status === 'active');
  const invitations = data.invitations.filter(i => i.tenantId === ctx.tenantId && i.status === 'pending');
  const branches = data.branches.filter(b => b.tenantId === ctx.tenantId);
  const departments = data.departments.filter(d => d.tenantId === ctx.tenantId);
  const isAdmin = can('admin.users');
  const seats = users.length;

  const roleOf = (uid: string) => members.find(m => m.userId === uid)?.role ?? 'employee';

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Administration']} title="Administration"
        sub={`${seats} users · ${branches.length} branches · plan: ${tenant.plan}`}
        actions={isAdmin ? <button className="btn" onClick={() => setInviteOpen(true)}><Icon name="plus" size={14} /> Invite user</button> : undefined} />

      <div className="card pad-lg stack">
        <Tabs tabs={[
          ['users', `Users (${seats})`],
          ['structure', `Branches & departments`],
          ['org', 'Organisation'],
          ...(can('admin.subscription') ? [['plan', 'Plan & billing']] : []),
        ] as [string, string][]} value={tab} onChange={setTab} />
      </div>

      {tab === 'users' && (
        <Table head={['User', 'Role', 'Permissions', 'Status', '']}>
          {users.map(u => (
            <tr key={u.id}>
              <td>
                <div className="row nowrap" style={{ gap: 9 }}>
                  <UserAvatar name={u.name} email={u.email} />
                  <div><div className="b sm">{u.name}{u.id === user.id && <span className="xs faint"> (you)</span>}</div><div className="xs muted">{u.email}</div></div>
                </div>
              </td>
              <td>
                {isAdmin && u.id !== user.id ? (
                  <select className="select sm" style={{ width: 170 }} value={roleOf(u.id)} aria-label="Role"
                    onChange={e => { try { changeMemberRole(ctx, u.id, e.target.value as RoleId); toast(`${u.name.split(' ')[0]} is now ${ROLE_LABELS[e.target.value as RoleId]}`); } catch (err) { toast((err as Error).message, 'bad'); } }}>
                    {(ctx.role === 'org_owner' ? ([...USER_ROLES, 'org_owner'] as RoleId[]) : USER_ROLES).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : <Badge tone="accent">{ROLE_LABELS[roleOf(u.id)]}</Badge>}
              </td>
              <td className="xs muted">{permissionsForRole(roleOf(u.id)).size} permissions</td>
              <td><StatusBadge s={u.status} /></td>
              <td className="xs faint">{fmtTimeAgo(u.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === 'users' && invitations.length > 0 && (
        <div className="card pad-lg stack">
          <h3>Pending invitations</h3>
          {invitations.map(i => (
            <div key={i.id} className="row between card flat card-tight">
              <span><b className="sm">{i.name}</b> <span className="xs muted">· {i.email} · invited as {ROLE_LABELS[i.role]}</span></span>
              {isAdmin && <button className="btn sm secondary" onClick={() => { if (acceptInvitation(ctx, i.id)) toast(`${i.name} onboarded`); }}>Activate (demo)</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'structure' && (
        <div className="grid-2">
          <div className="card pad-lg stack">
            <div className="row between"><h3>Branches</h3></div>
            {branches.map(b => (
              <div key={b.id} className="row between">
                <span><Icon name="pin" size={14} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--muted)' }} /><b className="sm">{b.name}</b> <span className="xs muted">— {b.city}</span></span>
                <span className="xs faint">{data.assets.filter(a => a.branchId === b.id).length} assets</span>
              </div>
            ))}
            {isAdmin && (
              <div className="row">
                <input className="input" placeholder="New branch name…" value={branchName} onChange={e => setBranchNL(e.target.value)} aria-label="Branch name" />
                <button className="btn sm" disabled={branchName.trim().length < 3} onClick={() => { createBranch(ctx, branchName.trim(), tenant.city); setBranchNL(''); toast('Branch added'); }}>Add</button>
              </div>
            )}
          </div>
          <DepartmentsPanel editable={isAdmin} departments={departments} branches={branches} />
        </div>
      )}

      {tab === 'org' && <OrgProfile />}

      {tab === 'plan' && can('admin.subscription') && (
        <div className="grid-2">
          <div className="card pad-lg stack">
            <h3>Current plan — {tenant.plan}</h3>
            <p className="muted sm">Seats used: {seats}. AI assistant credits this cycle: {tenant.aiAssistCredits}.</p>
            <div className="grid-2">
              {(Object.keys(PLAN_PRICE) as (keyof typeof PLAN_PRICE)[]).filter(p => p !== 'enterprise').map(p => (
                <button key={p} className={`card flat card-tight`} style={{ textAlign: 'left', cursor: 'pointer', border: tenant.plan === p ? '1px solid var(--accent)' : '1px solid transparent' }}
                  onClick={() => { try { setSubscriptionPlan(ctx, p as typeof tenant.plan); toast(`Plan changed to ${p}`); } catch (e) { toast((e as Error).message, 'bad'); } }}>
                  <b className="sm capitalize">{p}</b>
                  <div className="xs muted">{ngn(PLAN_PRICE[p]!)}/mo</div>
                </button>
              ))}
            </div>
            <p className="xs faint">Plan changes are simulated in the demo — in production this flows through Paystack.</p>
          </div>
        </div>
      )}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function DepartmentsPanel({ editable, departments, branches }: { editable: boolean; departments: { id: string; name: string; branchId: string }[]; branches: { id: string; name: string }[] }) {
  const { ctx } = useSessionCtx();
  const [name, setName] = useState('');
  const bMap = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  return (
    <div className="card pad-lg stack">
      <h3>Departments</h3>
      {departments.map(d => (
        <div key={d.id} className="row between"><b className="sm">{d.name}</b><span className="xs muted">{bMap.get(d.branchId) ?? '—'}</span></div>
      ))}
      {editable && branches.length > 0 && (
        <div className="row">
          <input className="input" placeholder="New department…" value={name} onChange={e => setName(e.target.value)} aria-label="Department name" />
          <button className="btn sm" disabled={name.trim().length < 2} onClick={() => { createDepartment(ctx, branches[0]!.id, name.trim()); setName(''); toast('Department added'); }}>Add</button>
        </div>
      )}
    </div>
  );
}

function OrgProfile() {
  const { ctx, tenant } = useSessionCtx();
  const [name, setName] = useState(tenant.name);
  const [city, setCity] = useState(tenant.city);
  const dirty = name !== tenant.name || city !== tenant.city;
  return (
    <div className="card pad-lg stack" style={{ maxWidth: 560 }}>
      <h3>Organisation profile</h3>
      <div className="field"><label>Legal name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label>HQ city</label>
        <select className="select" value={city} onChange={e => setCity(e.target.value)}>{['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano'].map(c => <option key={c}>{c}</option>)}</select></div>
      <button className="btn" disabled={!dirty} onClick={() => { updateTenantProfile(ctx, { name: name.trim(), city }); toast('Profile updated'); }}>Save profile</button>
      <div className="kv" style={{ marginTop: 6 }}>
        <dt className="xs muted">Workspace URL</dt><dd className="mono xs">{tenant.slug}.app.techpros.com.ng</dd>
        <dt className="xs muted">Tenant type</dt><dd className="xs">{tenant.type === 'service_provider' ? 'Service provider' : 'Organisation'}</dd>
        <dt className="xs muted">Created</dt><dd className="xs">{fmtTimeAgo(tenant.createdAt)}</dd>
      </div>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ name: '', email: '', role: 'employee' as RoleId });
  const submit = () => {
    try {
      inviteUser(ctx, f.name.trim(), f.email.trim(), f.role);
      toast(`Invitation sent to ${f.email} (email simulated in demo)`);
      onClose();
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <Modal open onClose={onClose} title="Invite to workspace">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Full name</label>
          <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Adaeze Nwoko" autoFocus /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Work email</label>
          <input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="adaeze@org.ng" /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Role</label>
          <select className="select" value={f.role} onChange={e => setF({ ...f, role: e.target.value as RoleId })}>
            {USER_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]} — {permissionsForRole(r).size} permissions</option>)}
          </select></div>
      </div>
      <p className="hint">Least-privilege default: start people as Employee or Auditor and promote deliberately. Role changes write to the audit trail.</p>
      <button className="btn block" disabled={f.name.trim().length < 3 || !/\S+@\S+\.\S+/.test(f.email)} onClick={submit}>Send invitation</button>
    </Modal>
  );
}

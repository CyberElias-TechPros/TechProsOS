/** Administration — org profile, branches & departments, users & roles, plan. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { changeMemberRole, createBranch, createDepartment, inviteUser, setSubscriptionPlan, updateTenantProfile, deactivateUser, revokeInvitation } from '../../platform/actions';
import { SlaPanel, PrivacyPanel, SchedulesPanel, DelegationsPanel, IntegrationsPanel } from './AdminPanels';
import { PLANS, SELF_SERVE_PLANS } from '../../platform/plans';
import { tenantUsers } from '../../platform/db';
import { ROLE_LABELS, permissionsForRole } from '../../platform/permissions';
import type { RoleId } from '../../platform/types';
import { Badge, Modal, PageHead, StatusBadge, Table, Tabs, toast, UserAvatar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtTimeAgo, ngn } from '../../platform/util';

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
          ...(can('admin.org') ? [['sla', 'SLA & hours'], ['privacy', 'Privacy']] : []),
          ...(can('reports.report.export') ? [['schedules', 'Report schedules']] : []),
          ...(tenant.type === 'service_provider' && can('clients.client.manage') ? [['delegations', 'Client access']] : []),
          ...(can('admin.integrations') ? [['integrations', 'Integrations']] : []),
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
                    onChange={async e => { try { await changeMemberRole(ctx, u.id, e.target.value as RoleId); toast(`${u.name.split(' ')[0]} is now ${ROLE_LABELS[e.target.value as RoleId]}`); } catch (err) { toast((err as Error).message, 'bad'); } }}>
                    {(ctx.role === 'org_owner' ? ([...USER_ROLES, 'org_owner'] as RoleId[]) : USER_ROLES).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : <Badge tone="accent">{ROLE_LABELS[roleOf(u.id)]}</Badge>}
              </td>
              <td className="xs muted">{permissionsForRole(roleOf(u.id)).size} permissions</td>
              <td><StatusBadge s={u.status} /></td>
              <td className="xs faint">{fmtTimeAgo(u.createdAt)}{isAdmin && u.id !== user.id && roleOf(u.id) !== 'org_owner' && <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={async () => { if (!window.confirm(`Revoke workspace access for ${u.name}?`)) return; try { await deactivateUser(ctx, u.id); toast('Access revoked'); } catch (e) { toast((e as Error).message, 'bad'); } }}>Deactivate</button>}</td>
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
              <span className="row"><span className="xs muted">Awaiting recipient acceptance</span>{isAdmin && <button className="btn ghost sm" onClick={async () => { try { await revokeInvitation(ctx, i.id); toast('Invitation revoked'); } catch (e) { toast((e as Error).message, 'bad'); } }}>Revoke</button>}</span>
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
                <button className="btn sm" disabled={branchName.trim().length < 3} onClick={async () => { await createBranch(ctx, branchName.trim(), tenant.city); setBranchNL(''); toast('Branch added'); }}>Add</button>
              </div>
            )}
          </div>
          <DepartmentsPanel editable={isAdmin} departments={departments} branches={branches} />
        </div>
      )}

      {tab === 'org' && <OrgProfile />}
      {tab === 'sla' && <SlaPanel />}
      {tab === 'privacy' && <PrivacyPanel />}
      {tab === 'schedules' && <SchedulesPanel />}
      {tab === 'delegations' && <DelegationsPanel />}
      {tab === 'integrations' && <IntegrationsPanel />}

      {tab === 'plan' && can('admin.subscription') && (
        <div className="grid-2">
          <div className="card pad-lg stack">
            <h3>Current plan — {tenant.plan}</h3>
            <p className="muted sm">Seats used: {seats}. AI assistant credits this cycle: {tenant.aiAssistCredits}.</p>
            <div className="grid-2">
              {SELF_SERVE_PLANS.filter(p => (tenant.type === 'service_provider') === p.startsWith('msp_')).map(p => (
                <button key={p} className={`card flat card-tight`} style={{ textAlign: 'left', cursor: 'pointer', border: tenant.plan === p ? '1px solid var(--accent)' : '1px solid transparent' }}
                  onClick={async () => { try { await setSubscriptionPlan(ctx, p); toast('Opening secure checkout…'); } catch (e) { toast((e as Error).message, 'bad'); } }}>
                  <b className="sm">{PLANS[p].name}</b>
                  <div className="xs muted">{ngn(PLANS[p].monthlyNgn)}/mo · {PLANS[p].seats} seats</div>
                </button>
              ))}
            </div>
            <p className="xs faint">Demo previews plan changes locally. Live plan changes require verified Paystack checkout; entitlements update only after server-side verification.</p>
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
          <button className="btn sm" disabled={name.trim().length < 2} onClick={async () => { await createDepartment(ctx, branches[0]!.id, name.trim()); setName(''); toast('Department added'); }}>Add</button>
        </div>
      )}
    </div>
  );
}

function OrgProfile() {
  const { ctx, tenant } = useSessionCtx();
  const [name, setName] = useState(tenant.name);
  const [city, setCity] = useState(tenant.city);
  const [f, setF] = useState({
    legalName: tenant.legalName ?? '', tradingName: tenant.tradingName ?? '', rcNumber: tenant.rcNumber ?? '',
    tin: tenant.tin ?? '', address: tenant.address ?? '', website: tenant.website ?? '',
    supportEmail: tenant.supportEmail ?? '', accountsEmail: tenant.accountsEmail ?? '',
    bank: tenant.bankDetails?.bank ?? '', accountName: tenant.bankDetails?.accountName ?? '',
    accountNumber: tenant.bankDetails?.accountNumber ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const dirty = name !== tenant.name || city !== tenant.city
    || f.legalName !== (tenant.legalName ?? '') || f.tradingName !== (tenant.tradingName ?? '')
    || f.rcNumber !== (tenant.rcNumber ?? '') || f.tin !== (tenant.tin ?? '')
    || f.address !== (tenant.address ?? '') || f.website !== (tenant.website ?? '')
    || f.supportEmail !== (tenant.supportEmail ?? '') || f.accountsEmail !== (tenant.accountsEmail ?? '')
    || f.bank !== (tenant.bankDetails?.bank ?? '') || f.accountName !== (tenant.bankDetails?.accountName ?? '')
    || f.accountNumber !== (tenant.bankDetails?.accountNumber ?? '');
  const save = async () => {
    try {
      const bankComplete = f.bank.trim() && f.accountName.trim() && f.accountNumber.trim();
      if (f.accountNumber.trim() && !/^\d{10}$/.test(f.accountNumber.trim())) { toast('Account number must be a 10-digit NUBAN', 'bad'); return; }
      if (bankComplete && (!f.bank.trim() || !f.accountName.trim())) { toast('Bank name and account name are both required', 'bad'); return; }
      await updateTenantProfile(ctx, {
        name: name.trim(), city,
        legalName: f.legalName.trim(), tradingName: f.tradingName.trim(), rcNumber: f.rcNumber.trim(),
        tin: f.tin.trim(), address: f.address.trim(), website: f.website.trim(),
        supportEmail: f.supportEmail.trim(), accountsEmail: f.accountsEmail.trim(),
        ...(bankComplete ? { bankDetails: { bank: f.bank.trim(), accountName: f.accountName.trim(), accountNumber: f.accountNumber.trim() } } : {}),
      });
      toast('Organisation profile updated');
    } catch (e) { toast((e as Error).message, 'bad'); }
  };
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="card pad-lg stack">
        <h3>Organisation profile</h3>
        <div className="field"><label htmlFor="org-name">Display name</label><input id="org-name" className="input" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="org-city">HQ city</label>
          <select id="org-city" className="select" value={city} onChange={e => setCity(e.target.value)}>{['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano'].map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="kv" style={{ marginTop: 6 }}>
          <dt className="xs muted">Workspace</dt><dd className="mono xs">{tenant.slug}</dd>
          <dt className="xs muted">Tenant type</dt><dd className="xs">{tenant.type === 'service_provider' ? 'Service provider' : 'Organisation'}</dd>
          <dt className="xs muted">Created</dt><dd className="xs">{fmtTimeAgo(tenant.createdAt)}</dd>
        </div>
      </div>

      <div className="card pad-lg stack">
        <h3>Invoice identity</h3>
        <p className="sm muted">Printed on every invoice you issue. Leave a field empty to omit it — nothing is invented.</p>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="org-legal">Registered legal name</label>
            <input id="org-legal" className="input" value={f.legalName} onChange={set('legalName')} placeholder="As it appears on your CAC certificate" /></div>
          <div className="field"><label htmlFor="org-trading">Trading name</label>
            <input id="org-trading" className="input" value={f.tradingName} onChange={set('tradingName')} placeholder="Customer-facing brand" /></div>
          <div className="field"><label htmlFor="org-rc">RC number</label>
            <input id="org-rc" className="input" inputMode="numeric" value={f.rcNumber} onChange={set('rcNumber')} /></div>
          <div className="field"><label htmlFor="org-tin">TIN</label>
            <input id="org-tin" className="input" inputMode="numeric" value={f.tin} onChange={set('tin')} /></div>
          <div className="field"><label htmlFor="org-web">Website</label>
            <input id="org-web" className="input" value={f.website} onChange={set('website')} placeholder="example.com.ng" /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="org-addr">Business address</label>
            <textarea id="org-addr" className="input" rows={2} value={f.address} onChange={set('address')} /></div>
          <div className="field"><label htmlFor="org-support">Support email</label>
            <input id="org-support" className="input" type="email" value={f.supportEmail} onChange={set('supportEmail')} /></div>
          <div className="field"><label htmlFor="org-accounts">Accounts email</label>
            <input id="org-accounts" className="input" type="email" value={f.accountsEmail} onChange={set('accountsEmail')} /></div>
        </div>
      </div>

      <div className="card pad-lg stack">
        <h3>Payment details</h3>
        <p className="sm muted">Shown in the “Pay to” line on invoices. All three fields are required together.</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="org-bank">Bank</label>
            <input id="org-bank" className="input" value={f.bank} onChange={set('bank')} /></div>
          <div className="field"><label htmlFor="org-acct">Account number (NUBAN)</label>
            <input id="org-acct" className="input" inputMode="numeric" maxLength={10} value={f.accountNumber} onChange={set('accountNumber')} aria-describedby="org-acct-help" /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="org-acctname">Account name</label>
            <input id="org-acctname" className="input" value={f.accountName} onChange={set('accountName')} /></div>
        </div>
        <p id="org-acct-help" className="xs muted">Exactly 10 digits. Must match the account name your bank holds.</p>
      </div>

      <div><button className="btn" disabled={!dirty} onClick={() => void save()}>Save organisation settings</button></div>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ name: '', email: '', role: 'employee' as RoleId });
  const submit = async () => {
    try {
      await inviteUser(ctx, f.name.trim(), f.email.trim(), f.role);
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

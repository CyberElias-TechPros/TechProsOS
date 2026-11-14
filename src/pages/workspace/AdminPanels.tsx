/** Administration settings: SLA, privacy, report schedules, MSP delegations, integrations. */
import { useState } from 'react';
import { useSessionCtx, useLiveAuth } from '../../platform/session';
import { useData } from '../../platform/store';
import { updateSla, requestPrivacy, resolvePrivacy, scheduleReport, pauseReportSchedule, grantDelegation, revokeDelegation, updateNotificationSettings } from '../../platform/actions';
import { DELEGATABLE_PERMISSIONS } from '../../platform/permissions';
import { DEFAULT_SLA_TARGETS, defaultCalendar } from '../../platform/sla';
import { tenantUsers } from '../../platform/db';
import { toast, Table, Empty } from '../../components/ui';
import { fmtDate } from '../../platform/util';
import type { Permission } from '../../platform/permissions';

export function SlaPanel() {
  const { ctx, can } = useSessionCtx(); const data = useData(s => s.data);
  const policy = data.slaPolicies.find(p => p.tenantId === ctx.tenantId);
  const base = policy ?? { ...defaultCalendar(), name: 'Standard business-hours SLA', targets: DEFAULT_SLA_TARGETS, holidays: [] as string[] };
  const [f, setF] = useState({ name: base.name, workStartHour: base.workStartHour, workEndHour: base.workEndHour, workDays: base.workDays, holidays: (base.holidays ?? []).join(', '), targets: base.targets ?? DEFAULT_SLA_TARGETS });
  const editable = can('admin.org');
  const save = async () => { try { await updateSla(ctx, { name: f.name.trim(), timezone: 'Africa/Lagos', workStartHour: f.workStartHour, workEndHour: f.workEndHour, workDays: f.workDays, holidays: f.holidays.split(',').map(s => s.trim()).filter(Boolean), targets: f.targets }); toast('SLA policy saved; existing deadlines are preserved'); } catch (e) { toast((e as Error).message, 'bad'); } };
  return <div className="card pad-lg stack" style={{ maxWidth: 720 }}>
    <h3>SLA policy · Africa/Lagos</h3>
    <div className="form-grid">
      <div className="field"><label htmlFor="sla-name">Policy name</label><input id="sla-name" className="input" value={f.name} disabled={!editable} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="sla-start">Workday start (hour)</label><input id="sla-start" className="input" type="number" min={0} max={23} value={f.workStartHour} disabled={!editable} onChange={e => setF({ ...f, workStartHour: +e.target.value })} /></div>
      <div className="field"><label htmlFor="sla-end">Workday end (hour)</label><input id="sla-end" className="input" type="number" min={1} max={24} value={f.workEndHour} disabled={!editable} onChange={e => setF({ ...f, workEndHour: +e.target.value })} /></div>
    </div>
    <fieldset className="stack"><legend className="lbl">Working days</legend><div className="row">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <label key={d} className="row sm" style={{ gap: 4 }}><input type="checkbox" disabled={!editable} checked={f.workDays.includes(i)} onChange={e => setF({ ...f, workDays: e.target.checked ? [...f.workDays, i].sort() : f.workDays.filter(x => x !== i) })} />{d}</label>)}</div></fieldset>
    <div className="field"><label htmlFor="sla-holidays">Holidays (YYYY-MM-DD, comma-separated)</label><input id="sla-holidays" className="input" value={f.holidays} disabled={!editable} onChange={e => setF({ ...f, holidays: e.target.value })} /></div>
    <Table head={['Priority', 'Response (business minutes)', 'Resolution (business minutes)']}>
      {(['critical', 'high', 'medium', 'low'] as const).map(p => <tr key={p}><td className="b sm capitalize">{p}</td><td><input className="input" type="number" min={1} aria-label={`${p} response`} value={f.targets[p].response} disabled={!editable} onChange={e => setF({ ...f, targets: { ...f.targets, [p]: { ...f.targets[p], response: +e.target.value } } })} /></td><td><input className="input" type="number" min={1} aria-label={`${p} resolution`} value={f.targets[p].resolve} disabled={!editable} onChange={e => setF({ ...f, targets: { ...f.targets, [p]: { ...f.targets[p], resolve: +e.target.value } } })} /></td></tr>)}
    </Table>
    {editable && <button className="btn" onClick={save}>Save SLA policy</button>}
  </div>;
}

export function PrivacyPanel() {
  const { ctx, user, can } = useSessionCtx(); const data = useData(s => s.data);
  const requests = data.privacyRequests.filter(r => r.tenantId === ctx.tenantId);
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (kind: 'export' | 'erasure') => { setBusy(true); try { await requestPrivacy(ctx, kind, reason.trim() || `${kind} request`); toast('Privacy request submitted for administrator review'); setReason(''); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); } };
  const resolve = async (id: string, status: 'completed' | 'rejected') => { const why = window.prompt('Resolution note (required for the audit trail)'); if (!why?.trim()) return; try { await resolvePrivacy(ctx, id, status, why.trim()); toast(`Request ${status}`); } catch (e) { toast((e as Error).message, 'bad'); } };
  return <div className="stack">
    <div className="card pad-lg stack" style={{ maxWidth: 640 }}>
      <h3>Request personal data action</h3>
      <p className="sm muted">Exports remain available after subscription lapse. Erasure anonymises the account while retaining legally required business records; owners must transfer ownership first.</p>
      <div className="field"><label htmlFor="priv-reason">Reason / details</label><textarea id="priv-reason" className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <div className="row"><button className="btn secondary" disabled={busy} onClick={() => void submit('export')}>Request export</button><button className="btn ghost" disabled={busy} onClick={() => void submit('erasure')}>Request erasure</button></div>
    </div>
    {requests.length === 0 ? <Empty icon="shield" title="No privacy requests" /> : <Table head={['User', 'Kind', 'Status', 'Created', '']}>
      {requests.map(r => <tr key={r.id}><td className="sm">{data.users.find(u => u.id === r.userId)?.name ?? r.userId}</td><td className="sm capitalize">{r.kind}</td><td className="sm capitalize">{r.status}</td><td className="sm">{fmtDate(r.createdAt)}</td><td>{can('admin.org') && r.status === 'pending' && r.userId !== user.id && <div className="row"><button className="btn sm secondary" onClick={() => void resolve(r.id, 'completed')}>Complete</button><button className="btn sm ghost" onClick={() => void resolve(r.id, 'rejected')}>Reject</button></div>}</td></tr>)}
    </Table>}
  </div>;
}

export function SchedulesPanel() {
  const { ctx, can } = useSessionCtx(); const data = useData(s => s.data);
  const schedules = data.reportSchedules.filter(s => s.tenantId === ctx.tenantId);
  const [f, setF] = useState({ reportId: 'itsm' as 'exec' | 'itsm' | 'assets' | 'finance', name: '', cadence: 'weekly' as 'daily' | 'weekly' | 'monthly', recipients: '', nextRunAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16) });
  const editable = can('reports.report.export');
  const create = async () => { try { await scheduleReport(ctx, { reportId: f.reportId, name: f.name.trim() || `${f.reportId} report`, cadence: f.cadence, recipients: f.recipients.split(',').map(s => s.trim()).filter(Boolean), nextRunAt: new Date(f.nextRunAt).toISOString() }); toast('Report schedule created'); setF({ ...f, name: '', recipients: '' }); } catch (e) { toast((e as Error).message, 'bad'); } };
  return <div className="stack">
    {editable && <div className="card pad-lg stack" style={{ maxWidth: 720 }}>
      <h3>Schedule a report</h3>
      <div className="form-grid">
        <div className="field"><label htmlFor="sch-name">Name</label><input id="sch-name" className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="sch-report">Report</label><select id="sch-report" className="select" value={f.reportId} onChange={e => setF({ ...f, reportId: e.target.value as typeof f.reportId })}><option value="exec">Executive</option><option value="itsm">Service desk</option><option value="assets">Assets</option><option value="finance">Finance</option></select></div>
        <div className="field"><label htmlFor="sch-cadence">Cadence</label><select id="sch-cadence" className="select" value={f.cadence} onChange={e => setF({ ...f, cadence: e.target.value as typeof f.cadence })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        <div className="field"><label htmlFor="sch-next">First run</label><input id="sch-next" className="input" type="datetime-local" value={f.nextRunAt} onChange={e => setF({ ...f, nextRunAt: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="sch-rec">Recipients (comma-separated emails)</label><input id="sch-rec" className="input" value={f.recipients} onChange={e => setF({ ...f, recipients: e.target.value })} /></div>
      </div>
      <button className="btn" disabled={!f.recipients.includes('@')} onClick={create}>Create schedule</button>
    </div>}
    {schedules.length === 0 ? <Empty icon="reports" title="No report schedules" /> : <Table head={['Name', 'Report', 'Cadence', 'Next run', 'Status', '']}>
      {schedules.map(s => <tr key={s.id}><td className="b sm">{s.name}</td><td className="sm">{s.reportId}</td><td className="sm capitalize">{s.cadence}</td><td className="sm">{fmtDate(s.nextRunAt)}</td><td className="sm">{s.active ? 'Active' : 'Paused'}</td><td>{editable && <button className="btn sm ghost" onClick={async () => { try { await pauseReportSchedule(ctx, s.id, !s.active); toast(s.active ? 'Paused' : 'Resumed'); } catch (e) { toast((e as Error).message, 'bad'); } }}>{s.active ? 'Pause' : 'Resume'}</button>}</td></tr>)}
    </Table>}
  </div>;
}

export function DelegationsPanel() {
  const { ctx } = useSessionCtx(); const data = useData(s => s.data);
  const clients = data.tenants.filter(t => t.providerId === ctx.tenantId);
  const staff = tenantUsers(data, ctx.tenantId);
  const grants = data.delegations.filter(g => g.providerId === ctx.tenantId);
  const [f, setF] = useState({ clientTenantId: clients[0]?.id ?? '', userId: staff[0]?.id ?? '', permissions: ['itsm.ticket.view.own', 'itsm.ticket.update'] as Permission[], expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const grant = async () => { try { await grantDelegation(ctx, { clientTenantId: f.clientTenantId, userId: f.userId, permissions: f.permissions, expiresAt: new Date(f.expiresAt + 'T23:59:59Z').toISOString() }); toast('Client access granted'); } catch (e) { toast((e as Error).message, 'bad'); } };
  return <div className="stack">
    <div className="card pad-lg stack" style={{ maxWidth: 760 }}>
      <h3>Grant expiring client access</h3>
      <p className="sm muted">Provider staff never inherit blanket client access. Grants intersect the staff role with selected permissions and expire automatically.</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="del-client">Client workspace</label><select id="del-client" className="select" value={f.clientTenantId} onChange={e => setF({ ...f, clientTenantId: e.target.value })}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="del-user">Staff member</label><select id="del-user" className="select" value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })}>{staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label htmlFor="del-exp">Expires</label><input id="del-exp" className="input" type="date" value={f.expiresAt} onChange={e => setF({ ...f, expiresAt: e.target.value })} /></div>
      </div>
      <fieldset className="stack"><legend className="lbl">Permissions</legend><div className="grid-2">{DELEGATABLE_PERMISSIONS.map(p => <label key={p} className="row sm" style={{ gap: 6 }}><input type="checkbox" checked={f.permissions.includes(p)} onChange={e => setF({ ...f, permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter(x => x !== p) })} />{p}</label>)}</div></fieldset>
      <button className="btn" disabled={!f.clientTenantId || !f.userId || f.permissions.length === 0} onClick={grant}>Grant access</button>
    </div>
    {grants.length === 0 ? <Empty icon="clients" title="No client access grants" /> : <Table head={['Client', 'User', 'Permissions', 'Expires', 'Status', '']}>
      {grants.map(g => <tr key={g.id}><td className="sm">{data.tenants.find(t => t.id === g.tenantId)?.name ?? g.tenantId}</td><td className="sm">{data.users.find(u => u.id === g.userId)?.name ?? g.userId}</td><td className="xs muted">{g.permissions.length} selected</td><td className="sm">{fmtDate(g.expiresAt)}</td><td className="sm capitalize">{g.status}</td><td>{g.status === 'active' && <button className="btn sm ghost" onClick={async () => { try { await revokeDelegation(ctx, g.id); toast('Access revoked'); } catch (e) { toast((e as Error).message, 'bad'); } }}>Revoke</button>}</td></tr>)}
    </Table>}
  </div>;
}

export function IntegrationsPanel() {
  const { ctx, tenant, can } = useSessionCtx(); const config = useLiveAuth(s => s.config); const mode = useData(s => s.mode);
  const [emails, setEmails] = useState(tenant.notificationEmails !== false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return <div className="stack" style={{ maxWidth: 820 }}>
    <div className="card pad-lg stack">
      <h3>Notification email</h3>
      <label className="row sm" style={{ gap: 8 }}><input type="checkbox" checked={emails} disabled={!can('admin.org')} onChange={async e => { setEmails(e.target.checked); try { await updateNotificationSettings(ctx, e.target.checked); toast('Notification preference saved'); } catch (err) { toast((err as Error).message, 'bad'); } }} /> Send notification emails for assignments, SLA breaches and reviews</label>
    </div>
    <div className="card pad-lg stack">
      <h3>Integration status</h3>
      <p className="sm muted">Mode: <b>{mode}</b>. Keys are configured server-side via environment variables; they are never exposed to the browser.</p>
      <Table head={['Capability', 'Status', 'Configuration']}>
        <tr><td className="b sm">Transactional email</td><td className="sm">{config?.features.email || mode === 'demo' ? 'Ready / demo' : 'Not configured'}</td><td className="xs mono">RESEND_API_KEY, EMAIL_FROM</td></tr>
        <tr><td className="b sm">Paystack billing</td><td className="sm">{config?.features.billing ? 'Ready' : 'Not configured'}</td><td className="xs mono">PAYSTACK_SECRET_KEY</td></tr>
        <tr><td className="b sm">Monitoring ingest</td><td className="sm">Ready</td><td className="xs mono">Per-device bearer token</td></tr>
        <tr><td className="b sm">Scheduled jobs</td><td className="sm">{config?.setupRequired.length ? 'Setup required' : 'Ready'}</td><td className="xs mono">CRON_SECRET, DATABASE_URL</td></tr>
      </Table>
      <div className="stack sm">
        <div><span className="lbl">Paystack webhook</span><code className="card flat pad xs">{origin}/api/webhooks/paystack</code></div>
        <div><span className="lbl">Monitoring endpoint</span><code className="card flat pad xs">{origin}/api/integrations/monitoring</code></div>
        <div><span className="lbl">Cron endpoint</span><code className="card flat pad xs">{origin}/api/cron/run</code></div>
      </div>
    </div>
  </div>;
}

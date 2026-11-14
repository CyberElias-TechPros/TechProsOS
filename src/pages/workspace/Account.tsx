/** Account security & privacy — live server-backed profile, password, MFA, sessions. */
import { useEffect, useState } from 'react';
import { useSessionCtx, useLiveAuth, useSignOut } from '../../platform/session';
import { useData } from '../../platform/store';
import { api } from '../../platform/api';
import { PageHead, toast, Modal } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDate } from '../../platform/util';

export default function Account() {
  const { user } = useSessionCtx(); const mode = useData(s => s.mode); const signOut = useSignOut();
  const liveUser = useLiveAuth(s => s.user);
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone ?? '', title: user.title ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', password: '', code: '' });
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; uri: string } | null>(null); const [mfaCode, setMfaCode] = useState(''); const [recovery, setRecovery] = useState<string[] | null>(null);
  const [sessions, setSessions] = useState<{ id: string; created_at: string; expires_at: string; current: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const refreshSessions = async () => { try { setSessions((await api.sessions()).sessions); } catch { /* demo */ } };
  useEffect(() => { if (mode === 'live') void refreshSessions(); }, [mode]);
  if (mode !== 'live') return <div className="stack"><PageHead crumbs={['Workspace', 'Account']} title="Account" sub="Demo accounts are fictional and managed locally." /><div className="card pad-lg muted sm">Sign out and pick another persona from the login page. Live deployments provide verified email, password reset, MFA and session management here.</div></div>;
  const u = liveUser ?? user;
  const saveProfile = async () => { setBusy(true); try { await api.accountProfile(profile); toast('Profile updated'); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); } };
  const changePassword = async () => { setBusy(true); try { await api.changePassword({ currentPassword: pw.currentPassword, password: pw.password, code: pw.code || undefined }); toast('Password changed; other sessions revoked'); setPw({ currentPassword: '', password: '', code: '' }); } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); } };
  const startMfa = async () => { const password = window.prompt('Confirm your password to set up an authenticator'); if (!password) return; try { setMfaSetup(await api.mfaSetup(password)); } catch (e) { toast((e as Error).message, 'bad'); } };
  const enableMfa = async () => { try { const r = await api.mfaEnable(mfaCode); setRecovery(r.recoveryCodes); setMfaSetup(null); setMfaCode(''); toast('Authenticator enabled'); } catch (e) { toast((e as Error).message, 'bad'); } };
  const disableMfa = async () => { const code = window.prompt('Enter authenticator or recovery code to disable MFA'); if (!code) return; try { await api.mfaDisable(code); toast('MFA disabled'); void refreshSessions(); } catch (e) { toast((e as Error).message, 'bad'); } };
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <PageHead crumbs={['Workspace', 'Account']} title="Account & security" sub={`${u.email} · ${u.emailVerified ? 'verified' : 'unverified'}`} actions={<button className="btn secondary" onClick={signOut}><Icon name="logout" size={14} /> Sign out</button>} />
      <div className="card pad-lg stack">
        <h3>Profile</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="acc-name">Name</label><input id="acc-name" className="input" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="acc-phone">Phone</label><input id="acc-phone" className="input" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></div>
          <div className="field"><label htmlFor="acc-title">Job title</label><input id="acc-title" className="input" value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} /></div>
        </div>
        <button className="btn" disabled={busy} onClick={saveProfile}>Save profile</button>
      </div>
      <div className="card pad-lg stack">
        <h3>Password</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="acc-cur">Current password</label><input id="acc-cur" className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} /></div>
          <div className="field"><label htmlFor="acc-new">New password (12+)</label><input id="acc-new" className="input" type="password" autoComplete="new-password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} /></div>
          {u.mfaEnabled && <div className="field"><label htmlFor="acc-pw-code">Authenticator code</label><input id="acc-pw-code" className="input" value={pw.code} onChange={e => setPw({ ...pw, code: e.target.value })} /></div>}
        </div>
        <button className="btn" disabled={busy || pw.password.length < 12} onClick={changePassword}>Change password</button>
      </div>
      <div className="card pad-lg stack">
        <div className="row between"><h3>Two-factor authentication</h3><span className={`badge ${u.mfaEnabled ? 'ok' : 'warn'}`}>{u.mfaEnabled ? 'Enabled' : 'Recommended'}</span></div>
        {!u.mfaEnabled && !mfaSetup && <button className="btn secondary" onClick={startMfa}>Set up authenticator</button>}
        {mfaSetup && <div className="stack"><p className="sm muted">Add this secret to your authenticator app, then enter the 6-digit code.</p><code className="card flat pad">{mfaSetup.secret}</code><div className="field"><label htmlFor="mfa-code">Code</label><input id="mfa-code" className="input" value={mfaCode} onChange={e => setMfaCode(e.target.value)} /></div><button className="btn" onClick={enableMfa}>Enable</button></div>}
        {u.mfaEnabled && <button className="btn ghost" onClick={disableMfa}>Disable MFA</button>}
      </div>
      <div className="card pad-lg stack">
        <div className="row between"><h3>Active sessions</h3><button className="btn ghost sm" onClick={async () => { try { await api.revokeSessions({ all: true }); toast('Other sessions revoked'); void refreshSessions(); } catch (e) { toast((e as Error).message, 'bad'); } }}>Revoke others</button></div>
        {sessions.map(s => <div key={s.id} className="row between sm"><span>{s.current ? 'This device' : `Session ${s.id}`} · started {fmtDate(s.created_at)}</span>{!s.current && <button className="btn ghost sm" onClick={async () => { await api.revokeSessions({ id: s.id }); void refreshSessions(); }}>Revoke</button>}</div>)}
      </div>
      <div className="card pad-lg stack">
        <h3>Privacy</h3>
        <div className="row"><a className="btn secondary" href={api.exportAccountUrl}>Export my account data</a><a className="btn secondary" href={api.exportWorkspaceUrl}>Export workspace (admin)</a></div>
        <p className="xs muted">Business records are retained for audit/legal obligations. Account erasure requests are handled under Administration → Privacy.</p>
      </div>
      {recovery && <Modal open onClose={() => setRecovery(null)} title="Save your recovery codes"><p className="sm muted">Each code works once. Store them securely; they are not shown again.</p><div className="stack mono sm">{recovery.map(c => <code key={c}>{c}</code>)}</div><button className="btn block" onClick={() => setRecovery(null)}>I have saved them</button></Modal>}
    </div>
  );
}

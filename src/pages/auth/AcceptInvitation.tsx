import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../platform/api';
import { useLiveAuth } from '../../platform/session';
import { toast } from '../../components/ui';
export default function AcceptInvitation() {
  const [params] = useSearchParams(); const token = params.get('token') ?? ''; const navigate = useNavigate(); const completeLogin = useLiveAuth(s => s.completeLogin);
  const [info, setInfo] = useState<{ name: string; email: string; role: string; tenant_name: string } | null>(null); const [error, setError] = useState('');
  const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => { try { const r = await api.invitation(token); setInfo(r); setName(r.name); } catch (e) { setError(e instanceof Error ? e.message : 'Invitation invalid'); } })(); }, [token]);
  const submit = async () => { setBusy(true); try { const r = await api.acceptInvitation({ token, name: name.trim(), password: password || undefined }); await completeLogin(r.user, r.tenantId); toast('Invitation accepted'); navigate('/app/overview', { replace: true }); } catch (e) { toast(e instanceof Error ? e.message : 'Acceptance failed', 'bad'); } finally { setBusy(false); } };
  return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack-lg"><h1 style={{ fontSize: 24 }}>Accept invitation</h1>{error && <p className="muted sm" role="alert">{error}</p>}{info && <><p className="muted sm">Join <b>{info.tenant_name}</b> as {info.role.replace(/_/g, ' ')} ({info.email}).</p><form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}><div className="field"><label htmlFor="inv-name">Your name</label><input id="inv-name" className="input" value={name} onChange={e => setName(e.target.value)} required /></div><div className="field"><label htmlFor="inv-password">Password (new accounts, or confirm existing password)</label><input id="inv-password" className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div><button className="btn block" disabled={busy || !name.trim()}>{busy ? 'Joining…' : 'Accept invitation'}</button></form></>}<Link to="/login" className="btn ghost">Back to sign in</Link></div></main></div>;
}

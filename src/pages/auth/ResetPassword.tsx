import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../platform/api';
import { toast } from '../../components/ui';
export default function ResetPassword() {
  const [params] = useSearchParams(); const token = params.get('token') ?? ''; const navigate = useNavigate();
  const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [needsMfa, setNeedsMfa] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await api.resetPassword({ token, password, code: code.trim() || undefined }); toast('Password changed. Sign in again.'); navigate('/login', { replace: true }); } catch (e) { if (e instanceof ApiError && e.code === 'MFA_REQUIRED') setNeedsMfa(true); toast(e instanceof Error ? e.message : 'Reset failed', 'bad'); } finally { setBusy(false); } };
  return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack-lg"><h1 style={{ fontSize: 24 }}>Choose a new password</h1><form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}><div className="field"><label htmlFor="rp-password">New password (12+ characters)</label><input id="rp-password" className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} required /></div>{needsMfa && <div className="field"><label htmlFor="rp-code">Authenticator or recovery code</label><input id="rp-code" className="input" value={code} onChange={e => setCode(e.target.value)} required /></div>}<button className="btn block" disabled={busy || !token}>{busy ? 'Saving…' : 'Reset password'}</button></form><Link to="/login" className="btn ghost">Back to sign in</Link></div></main></div>;
}

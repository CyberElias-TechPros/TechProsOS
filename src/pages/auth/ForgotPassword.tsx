import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../platform/api';
import { toast } from '../../components/ui';
export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async () => { setBusy(true); try { await api.forgotPassword(email.trim()); setSent(true); } catch (e) { toast(e instanceof Error ? e.message : 'Request failed', 'bad'); } finally { setBusy(false); } };
  return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack-lg"><h1 style={{ fontSize: 24 }}>Reset your password</h1>{sent ? <p className="muted sm" role="status">If the account exists, a reset link has been queued. It expires in 30 minutes.</p> : <form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}><div className="field"><label htmlFor="fp-email">Work email</label><input id="fp-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button></form>}<Link to="/login" className="btn ghost">Back to sign in</Link></div></main></div>;
}

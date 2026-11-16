/** Sign-in — live server sessions or explicitly fictional local demo personas. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../platform/store';
import { DEMO, DEMO_USERS } from '../../platform/seed';
import { useSession, useLiveAuth } from '../../platform/session';
import { ROLE_LABELS } from '../../platform/permissions';
import { toast, UserAvatar } from '../../components/ui';
import { Icon } from '../../components/icons';
import { api, ApiError } from '../../platform/api';

const PERSONAS = [
  { userId: DEMO_USERS.chidera, tenantId: DEMO.greenfield, label: 'Organisation owner — Greenfield Academy', note: 'Full control of a school workspace' },
  { userId: DEMO_USERS.emeka, tenantId: DEMO.greenfield, label: 'IT technician — Greenfield Academy', note: 'Team queue, assets, maintenance' },
  { userId: DEMO_USERS.tobi, tenantId: DEMO.greenfield, label: 'Employee — Greenfield Academy', note: 'Own tickets only — least privilege' },
  { userId: DEMO_USERS.adaeze, tenantId: DEMO.techpros, label: 'Service delivery manager — TechPros Services', note: 'Provider console with client workspaces' },
  { userId: DEMO_USERS.ifeoma, tenantId: DEMO.stives, label: 'Org admin — St. Ives Hospital', note: 'Second tenant, isolated data' },
];

export default function LoginPage() {
  const data = useData(s => s.data); const mode = useData(s => s.mode);
  const signIn = useSession(s => s.signIn); const navigate = useNavigate();
  const config = useLiveAuth(s => s.config); const completeLogin = useLiveAuth(s => s.completeLogin);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [needsVerification, setNeedsVerification] = useState(false);
  const isDemo = mode === 'demo' || config?.mode === 'demo';

  const tryDemoEmail = () => {
    const q = email.trim().toLowerCase(); const user = data.users.find(u => u.email.toLowerCase() === q);
    if (!user) { toast('No demo login with that email — use Sign-up to create a fictional workspace', 'bad'); return; }
    const member = data.memberships.find(m => m.userId === user.id && m.status === 'active');
    if (!member) { toast('That login has no active workspace', 'bad'); return; }
    signIn(user.id, member.tenantId); toast(`Welcome back, ${user.name.split(' ')[0]}`); navigate('/app/overview', { replace: true });
  };
  const choose = (p: (typeof PERSONAS)[number]) => { signIn(p.userId, p.tenantId); toast('Signed in to demo workspace'); navigate('/app/overview', { replace: true }); };

  const submit = async () => {
    setBusy(true); setNeedsVerification(false);
    try {
      if (challenge) { const r = await api.mfa(challenge, code.trim()); await completeLogin(r.user, r.tenantId); toast('Welcome back'); navigate('/app/overview', { replace: true }); return; }
      const r = await api.login(email.trim(), password);
      if (r.mfaRequired && r.challenge) { setChallenge(r.challenge); return; }
      if (r.user) { await completeLogin(r.user, r.tenantId ?? null); toast('Welcome back'); navigate('/app/overview', { replace: true }); }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_UNVERIFIED') setNeedsVerification(true);
      toast(e instanceof Error ? e.message : 'Sign-in failed', 'bad');
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <main className="auth-main">
        <div className="auth-card stack-lg">
          <div>
            <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none', marginBottom: 18 }}><span className="brand-mark">TP</span><b style={{ color: 'var(--fg)', fontSize: 15 }}>TechPros One</b></Link>
            <h1 style={{ fontSize: 24 }}>{challenge ? 'Two-factor authentication' : 'Sign in'}</h1>
            <p className="muted sm" style={{ marginTop: 6 }}>{isDemo ? 'This public demo runs entirely in your browser — no real accounts.' : 'Use your verified work email and password.'}</p>
          </div>
          {isDemo ? (
            <>
              <div className="stack">
                <input className="input" type="email" value={email} placeholder="you@organisation.ng" aria-label="Email" onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && tryDemoEmail()} />
                <button className="btn block" onClick={tryDemoEmail}><Icon name="key" size={14} /> Continue with demo email</button>
              </div>
              <div className="row" style={{ gap: 10 }}><hr className="divider" style={{ flex: 1 }} /><span className="xs faint">or jump in with a demo persona</span><hr className="divider" style={{ flex: 1 }} /></div>
              <div className="stack" style={{ gap: 8 }}>
                {PERSONAS.map(p => { const u = data.users.find(x => x.id === p.userId); return (
                  <button key={p.userId} className="btn secondary persona" onClick={() => choose(p)}>
                    {u && <span style={{ flex: 'none' }}><UserAvatar name={u.name} email={u.email} /></span>}
                    <span style={{ textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 13 }}>{p.label}</div>
                      <div className="xs muted">{p.note} · {u ? ROLE_LABELS[data.memberships.find(m => m.userId === u.id && m.tenantId === p.tenantId)?.role ?? 'employee'] : ''}</div>
                    </span>
                    <Icon name="arrowRight" size={15} style={{ marginLeft: 'auto', opacity: .5 }} />
                  </button>); })}
              </div>
            </>
          ) : (
            <form className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
              {!challenge && <>
                <div className="field"><label htmlFor="login-email">Work email</label><input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
                <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
              </>}
              {challenge && <div className="field"><label htmlFor="login-code">Authenticator or recovery code</label><input id="login-code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} autoFocus required /></div>}
              <button className="btn block" type="submit" disabled={busy}>{busy ? 'Signing in…' : challenge ? 'Verify' : 'Sign in'}</button>
              {needsVerification && <button type="button" className="btn ghost sm" onClick={async () => { try { await api.resendVerification(email.trim()); toast('Verification link queued'); } catch (e) { toast((e as Error).message, 'bad'); } }}>Resend verification email</button>}
              <div className="row between sm"><Link to="/forgot-password">Forgot password?</Link><Link to="/signup">Create workspace →</Link></div>
            </form>
          )}
          {isDemo && <p className="muted sm" style={{ textAlign: 'center' }}>New here? <Link to="/signup">Create your organisation →</Link></p>}
        </div>
      </main>
      <aside className="auth-aside" aria-hidden>
        <div className="hero-glow" style={{ top: -260, right: -200, opacity: .35 }} />
        <div style={{ position: 'relative' }}><div className="mkt-eyebrow" style={{ color: '#7db3ff' }}>{isDemo ? 'Demo without the sales call' : 'Secure by default'}</div><h2 style={{ fontSize: 27, maxWidth: '18ch' }}>{isDemo ? 'Every persona, real permissions' : 'Your workspace, protected'}</h2><p style={{ color: '#93a7c4', fontSize: 14, lineHeight: 1.7, marginTop: 8, maxWidth: '42ch' }}>{isDemo ? 'Sign in as an employee and you genuinely can’t open the finance module — the data layer refuses.' : 'Verified email, server-side permissions, tenant isolation and an immutable audit trail on every change.'}</p></div>
        <div className="sm" style={{ color: '#5c7190', position: 'relative' }}>{isDemo ? 'Demo data is fictional. Nothing leaves your browser.' : 'Sessions are HttpOnly and expire when idle.'}</div>
      </aside>
    </div>
  );
}

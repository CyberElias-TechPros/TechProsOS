/** Sign-in — demo build: pick a persona; the whole permission system behind it stays real. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../platform/store';
import { DEMO, DEMO_USERS } from '../../platform/seed';
import { useSession } from '../../platform/session';
import { ROLE_LABELS } from '../../platform/permissions';
import { toast } from '../../components/ui';
import { Icon } from '../../components/icons';

const PERSONAS: { userId: string; tenantId: string; label: string; note: string }[] = [
  { userId: DEMO_USERS.chidera, tenantId: DEMO.greenfield, label: 'Organisation owner — Greenfield Academy', note: 'Full control of a school workspace' },
  { userId: DEMO_USERS.emeka, tenantId: DEMO.greenfield, label: 'IT technician — Greenfield Academy', note: 'Team queue, assets, maintenance' },
  { userId: DEMO_USERS.tobi, tenantId: DEMO.greenfield, label: 'Employee — Greenfield Academy', note: 'Own tickets only — least privilege' },
  { userId: DEMO_USERS.adaeze, tenantId: DEMO.techpros, label: 'Service delivery manager — TechPros Services', note: 'Provider console with client workspaces' },
  { userId: DEMO_USERS.ifeoma, tenantId: DEMO.stives, label: 'Org admin — St. Ives Hospital', note: 'Second tenant, isolated data' },
];

export default function LoginPage() {
  const data = useData(s => s.data);
  const signIn = useSession(s => s.signIn);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const tryEmail = () => {
    const q = email.trim().toLowerCase();
    const user = data.users.find(u => u.email.toLowerCase() === q);
    if (!user) { toast('No demo login with that email — the demo is local-first, so accounts are created on the Sign-up page', 'bad'); return; }
    const member = data.memberships.find(m => m.userId === user.id && m.status === 'active');
    if (!member) { toast('That login has no active workspace', 'bad'); return; }
    signIn(user.id, member.tenantId);
    toast(`Welcome back, ${user.name.split(' ')[0]}`);
    navigate('/app/overview', { replace: true });
  };

  const choose = (p: (typeof PERSONAS)[number]) => {
    signIn(p.userId, p.tenantId);
    toast('Signed in to demo workspace');
    navigate('/app/overview', { replace: true });
  };

  return (
    <div className="auth-wrap">
      <main className="auth-main">
        <div className="auth-card stack-lg">
          <div>
            <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none', marginBottom: 18 }}>
              <span className="brand-mark">TP</span><b style={{ color: 'var(--fg)', fontSize: 15 }}>TechPros One</b>
            </Link>
            <h1 style={{ fontSize: 24 }}>Sign in</h1>
            <p className="muted sm" style={{ marginTop: 6 }}>This public demo runs entirely in your browser — no real accounts. Enter a demo email or pick a persona.</p>
          </div>
          <div className="stack">
            <input className="input" type="email" value={email} placeholder="you@organisation.ng" aria-label="Email"
              onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && tryEmail()} />
            <button className="btn block" onClick={tryEmail}><Icon name="key" size={14} /> Continue with email</button>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <hr className="divider" style={{ flex: 1 }} /><span className="xs faint">or jump in with a demo persona</span><hr className="divider" style={{ flex: 1 }} />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {PERSONAS.map(p => {
              const u = data.users.find(x => x.id === p.userId);
              return (
                <button key={p.userId} className="btn secondary" style={{ justifyContent: 'flex-start', height: 'auto', padding: '10px 13px' }} onClick={() => choose(p)}>
                  <span style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 650, fontSize: 13 }}>{p.label}</div>
                    <div className="xs muted">{p.note} · {u ? ROLE_LABELS[data.memberships.find(m => m.userId === u.id && m.tenantId === p.tenantId)?.role ?? 'employee'] : ''}</div>
                  </span>
                  <Icon name="arrowRight" size={15} style={{ marginLeft: 'auto', opacity: .5 }} />
                </button>
              );
            })}
          </div>
          <p className="muted sm" style={{ textAlign: 'center' }}>New here? <Link to="/signup">Create your organisation →</Link></p>
        </div>
      </main>
      <aside className="auth-aside" aria-hidden>
        <div className="hero-glow" style={{ top: -260, right: -200, opacity: .35 }} />
        <div style={{ position: 'relative' }}>
          <div className="mkt-eyebrow" style={{ color: '#7db3ff' }}>Demo without the sales call</div>
          <h2 style={{ fontSize: 27, maxWidth: '18ch' }}>Every persona, real permissions</h2>
          <p style={{ color: '#93a7c4', fontSize: 14, lineHeight: 1.7, marginTop: 8, maxWidth: '42ch' }}>
            Sign in as an employee and you genuinely can’t open the finance module — the data layer refuses.
            That’s the same enforcement your production rollout gets.
          </p>
        </div>
        <div className="sm" style={{ color: '#5c7190', position: 'relative' }}>Demo data is fictional. Nothing leaves your browser.</div>
      </aside>
    </div>
  );
}

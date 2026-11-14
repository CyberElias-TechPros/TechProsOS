/** Onboarding — create an organisation or provider workspace, stepwise. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerOrganisation } from '../../platform/db';
import { useSession, useLiveAuth } from '../../platform/session';
import { toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { NIGERIAN_CITIES } from '../../platform/util';
import { api } from '../../platform/api';
import type { RegisterInput } from '../../platform/contracts';

const INDUSTRIES = ['Education', 'Healthcare', 'Financial services', 'Logistics & warehousing', 'Hospitality', 'Manufacturing', 'Retail', 'Energy & oil & gas', 'Non-profit / NGO', 'Technology', 'Professional services', 'Public sector'];
const ORG_PLANS: [string, string][] = [['starter', 'Starter — ₦19,500/mo'], ['professional', 'Professional — ₦59,500/mo'], ['business', 'Business — ₦149,500/mo']];
const MSP_PLANS: [string, string][] = [['msp_launch', 'MSP Launch — ₦49,500/mo'], ['msp_growth', 'MSP Growth — ₦129,500/mo'], ['msp_scale', 'MSP Scale — ₦299,500/mo']];
type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const setWorkspace = useSession(s => s.setWorkspace); const config = useLiveAuth(s => s.config);
  const isDemo = config?.mode === 'demo';
  const [step, setStep] = useState<Step>(0); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const initialType = params.get('type') === 'service_provider' ? 'service_provider' : 'organisation';
  const [form, setForm] = useState({
    type: initialType as 'organisation' | 'service_provider', orgName: '', industry: 'Education', city: 'Lagos',
    plan: (initialType === 'service_provider' ? 'msp_launch' : (['starter', 'professional', 'business'].includes(params.get('plan') ?? '') ? params.get('plan')! : 'starter')),
    ownerName: '', ownerEmail: '', ownerPhone: '', password: '', consent: false,
    branchName: 'Head Office', branchCity: 'Lagos', departments: 'ICT, Admin',
  });
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const stepOk = useMemo(() => {
    if (step === 0) return form.orgName.trim().length >= 2 && !!form.city;
    if (step === 1) return form.ownerName.trim().includes(' ') && /\S+@\S+\.\S+/.test(form.ownerEmail) && (isDemo || form.password.length >= 12);
    return form.branchName.trim().length > 0 && form.departments.trim().length > 0 && (isDemo || form.consent);
  }, [form, step, isDemo]);

  const finish = async () => {
    setBusy(true);
    const input = { orgName: form.orgName.trim(), industry: form.type === 'service_provider' ? 'IT services' : form.industry, city: form.city, plan: form.plan as RegisterInput['plan'], type: form.type, ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(), ownerPhone: form.ownerPhone.trim(), branches: [{ name: form.branchName.trim(), city: form.branchCity }], departments: form.departments.split(',').map(s => s.trim()).filter(Boolean) };
    try {
      if (isDemo) { const { tenantId, userId } = registerOrganisation(input); setWorkspace(userId, tenantId); toast('Workspace created — welcome aboard'); navigate('/app/overview', { replace: true }); return; }
      await api.register({ ...input, password: form.password, consent: true }); setDone(true);
    } catch (e) { toast(e instanceof Error ? e.message : 'Registration failed', 'bad'); }
    finally { setBusy(false); }
  };
  const STEPS = ['Organisation', 'Your details', 'Structure'];
  if (done) return (
    <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack-lg">
      <h1 style={{ fontSize: 24 }}>Check your inbox</h1>
      <p className="muted sm">If this email can be registered, a verification link has been queued. Verify within one hour to activate your workspace and start the 14-day trial.</p>
      <Link className="btn block" to="/login">Back to sign in</Link>
    </div></main></div>
  );
  return (
    <div className="auth-wrap">
      <main className="auth-main">
        <div className="auth-card stack-lg" style={{ maxWidth: 480 }}>
          <div className="row between"><Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none' }}><span className="brand-mark">TP</span><b style={{ color: 'var(--fg)', fontSize: 15 }}>TechPros One</b></Link><span className="xs muted">Step {step + 1} of 3</span></div>
          <div><h1 style={{ fontSize: 23 }}>Create your workspace</h1><p className="muted sm" style={{ marginTop: 5 }}>{isDemo ? 'Fictional demo workspace — no real accounts' : '14-day trial · no card · verify your email to activate'}</p></div>
          <ul className="steps">{STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''}>{s}</li>)}</ul>
          {step === 0 && <div className="stack">
            <div className="seg" role="tablist"><button aria-pressed={form.type === 'organisation'} onClick={() => setForm(f => ({ ...f, type: 'organisation', plan: 'starter' }))}>I run an organisation</button><button aria-pressed={form.type === 'service_provider'} onClick={() => setForm(f => ({ ...f, type: 'service_provider', plan: 'msp_launch' }))}>I’m an IT provider</button></div>
            <div className="field"><label htmlFor="onb-org">{form.type === 'service_provider' ? 'Company name' : 'Organisation name'}</label><input id="onb-org" className="input" value={form.orgName} onChange={e => set('orgName')(e.target.value)} placeholder="Greenfield Academy" autoFocus /></div>
            {form.type === 'organisation' && <div className="field"><label htmlFor="onb-ind">Industry</label><select id="onb-ind" className="select" value={form.industry} onChange={e => set('industry')(e.target.value)}>{INDUSTRIES.map(i => <option key={i}>{i}</option>)}</select></div>}
            <div className="grid-2"><div className="field"><label htmlFor="onb-city">City</label><select id="onb-city" className="select" value={form.city} onChange={e => set('city')(e.target.value)}>{NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label htmlFor="onb-plan">Plan</label><select id="onb-plan" className="select" value={form.plan} onChange={e => set('plan')(e.target.value)}>{(form.type === 'service_provider' ? MSP_PLANS : ORG_PLANS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
          </div>}
          {step === 1 && <div className="stack">
            <div className="field"><label htmlFor="onb-name">Full name</label><input id="onb-name" className="input" value={form.ownerName} onChange={e => set('ownerName')(e.target.value)} placeholder="Chidera Okafor" autoFocus /></div>
            <div className="field"><label htmlFor="onb-email">Work email</label><input id="onb-email" className="input" type="email" value={form.ownerEmail} onChange={e => set('ownerEmail')(e.target.value)} placeholder="it@schools.ng" /></div>
            <div className="field"><label htmlFor="onb-phone">Phone (optional)</label><input id="onb-phone" className="input" value={form.ownerPhone} onChange={e => set('ownerPhone')(e.target.value)} placeholder="0803 000 0000" /></div>
            {!isDemo && <div className="field"><label htmlFor="onb-password">Password (12+ characters)</label><input id="onb-password" className="input" type="password" autoComplete="new-password" value={form.password} onChange={e => set('password')(e.target.value)} /></div>}
          </div>}
          {step === 2 && <div className="stack">
            <div className="grid-2"><div className="field"><label htmlFor="onb-branch">First branch</label><input id="onb-branch" className="input" value={form.branchName} onChange={e => set('branchName')(e.target.value)} /></div><div className="field"><label htmlFor="onb-bcity">Branch city</label><select id="onb-bcity" className="select" value={form.branchCity} onChange={e => set('branchCity')(e.target.value)}>{NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}</select></div></div>
            <div className="field"><label htmlFor="onb-deps">Departments (comma-separated)</label><input id="onb-deps" className="input" value={form.departments} onChange={e => set('departments')(e.target.value)} placeholder="ICT, Bursary, Admin" /></div>
            {!isDemo && <label className="row sm" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={form.consent} onChange={e => set('consent')(e.target.checked)} /> <span>I agree to the terms of service and privacy notice, and consent to processing my account data to provide the service.</span></label>}
            <p className="hint">You can add more branches and departments later under Administration.</p>
          </div>}
          <div className="row between">
            {step > 0 ? <button className="btn ghost" onClick={() => setStep((step - 1) as Step)}><Icon name="chevronL" size={14} /> Back</button> : <Link to="/login" className="btn ghost"><Icon name="chevronL" size={14} /> Sign in instead</Link>}
            {step < 2 ? <button className="btn" disabled={!stepOk} onClick={() => setStep((step + 1) as Step)}>Continue <Icon name="chevronR" size={14} /></button> : <button className="btn" disabled={!stepOk || busy} onClick={() => void finish()}>{busy ? 'Creating…' : 'Create workspace'}</button>}
          </div>
        </div>
      </main>
      <aside className="auth-aside" aria-hidden><div className="hero-glow" style={{ bottom: -300, left: -200, top: 'auto', right: 'auto', opacity: .3 }} /><div style={{ position: 'relative' }}><div className="mkt-eyebrow" style={{ color: '#7db3ff' }}>Built-in guardrails</div><h2 style={{ fontSize: 26, maxWidth: '20ch' }}>Your workspace ships with best practice</h2><ul className="feature-list" style={{ marginTop: 16, color: '#b8c8e2', gap: 12 }}>{['Business-hours SLA policy (WAT, Mon–Fri) ready to tune', 'RBAC with 16 roles out of the box', 'Every change lands in an immutable audit trail', 'Nigerian tax rules baked into invoicing'].map(x => <li key={x}>{x}</li>)}</ul></div><div className="sm" style={{ color: '#5c7190', position: 'relative' }}>Questions? support@techpros.com.ng</div></aside>
    </div>
  );
}

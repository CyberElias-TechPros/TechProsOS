/** Onboarding — create an organisation or provider workspace, stepwise. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerOrganisation } from '../../platform/db';
import { useSession } from '../../platform/session';
import { toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { NIGERIAN_CITIES } from '../../platform/util';

const INDUSTRIES = ['Education', 'Healthcare', 'Financial services', 'Logistics & warehousing', 'Hospitality', 'Manufacturing', 'Retail', 'Energy & oil & gas', 'Non-profit / NGO', 'Technology', 'Professional services', 'Public sector'];
const ORG_PLANS: [string, string][] = [['starter', 'Starter — ₦19,500/mo'], ['professional', 'Professional — ₦59,500/mo'], ['business', 'Business — ₦149,500/mo']];

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setWorkspace = useSession(s => s.setWorkspace);
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    type: (params.get('type') === 'service_provider' ? 'service_provider' : 'organisation') as 'organisation' | 'service_provider',
    orgName: '', industry: 'Education', city: 'Lagos',
    plan: (['starter', 'professional', 'business'].includes(params.get('plan') ?? '') ? params.get('plan')! : 'starter') as 'starter' | 'professional' | 'business',
    ownerName: '', ownerEmail: '', ownerPhone: '',
    branchName: 'Head Office', branchCity: 'Lagos',
    departments: 'ICT, Admin',
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const stepOk = useMemo(() => {
    if (step === 0) return form.orgName.trim().length >= 2 && !!form.city;
    if (step === 1) return form.ownerName.trim().includes(' ') && /\S+@\S+\.\S+/.test(form.ownerEmail);
    return form.branchName.trim().length > 0 && form.departments.trim().length > 0;
  }, [form, step]);

  const finish = () => {
    const { tenantId, userId } = registerOrganisation({
      orgName: form.orgName.trim(), industry: form.type === 'service_provider' ? 'IT services' : form.industry,
      city: form.city, plan: form.plan, type: form.type,
      ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(), ownerPhone: form.ownerPhone.trim() || '+234 800 000 0000',
      branches: [{ name: form.branchName.trim(), city: form.branchCity }],
      departments: form.departments.split(',').map(s => s.trim()).filter(Boolean),
    });
    setWorkspace(userId, tenantId);
    toast('Workspace created — welcome aboard');
    navigate('/app/overview', { replace: true });
  };

  const STEPS = ['Organisation', 'Your details', 'Structure'];

  return (
    <div className="auth-wrap">
      <main className="auth-main">
        <div className="auth-card stack-lg" style={{ maxWidth: 480 }}>
          <div className="row between">
            <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none' }}>
              <span className="brand-mark">TP</span><b style={{ color: 'var(--fg)', fontSize: 15 }}>TechPros One</b>
            </Link>
            <span className="xs muted">Step {step + 1} of 3</span>
          </div>
          <div>
            <h1 style={{ fontSize: 23 }}>Create your workspace</h1>
            <p className="muted sm" style={{ marginTop: 5 }}>14-day trial · no card · demo data you can wipe later</p>
          </div>
          <ul className="steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''}>{s}</li>
            ))}
          </ul>

          {step === 0 && (
            <div className="stack">
              <div className="seg" role="tablist">
                <button aria-pressed={form.type === 'organisation'} onClick={() => set('type')('organisation')}>I run an organisation</button>
                <button aria-pressed={form.type === 'service_provider'} onClick={() => set('type')('service_provider')}>I’m an IT provider</button>
              </div>
              <div className="field"><label htmlFor="onb-org">{form.type === 'service_provider' ? 'Company name' : 'Organisation name'}</label>
                <input id="onb-org" className="input" value={form.orgName} onChange={e => set('orgName')(e.target.value)} placeholder="Greenfield Academy" autoFocus /></div>
              {form.type === 'organisation' && (
                <div className="field"><label htmlFor="onb-ind">Industry</label>
                  <select id="onb-ind" className="select" value={form.industry} onChange={e => set('industry')(e.target.value)}>{INDUSTRIES.map(i => <option key={i}>{i}</option>)}</select></div>
              )}
              <div className="grid-2">
                <div className="field"><label htmlFor="onb-city">City</label>
                  <select id="onb-city" className="select" value={form.city} onChange={e => set('city')(e.target.value)}>{NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
                {form.type === 'organisation' && (
                  <div className="field"><label htmlFor="onb-plan">Plan</label>
                    <select id="onb-plan" className="select" value={form.plan} onChange={e => set('plan')(e.target.value)}>{ORG_PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <div className="field"><label htmlFor="onb-name">Full name</label>
                <input id="onb-name" className="input" value={form.ownerName} onChange={e => set('ownerName')(e.target.value)} placeholder="Chidera Okafor" autoFocus /></div>
              <div className="field"><label htmlFor="onb-email">Work email</label>
                <input id="onb-email" className="input" type="email" value={form.ownerEmail} onChange={e => set('ownerEmail')(e.target.value)} placeholder="it@schools.ng" /></div>
              <div className="field"><label htmlFor="onb-phone">Phone (optional)</label>
                <input id="onb-phone" className="input" value={form.ownerPhone} onChange={e => set('ownerPhone')(e.target.value)} placeholder="0803 000 0000" /></div>
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <div className="grid-2">
                <div className="field"><label htmlFor="onb-branch">First branch</label>
                  <input id="onb-branch" className="input" value={form.branchName} onChange={e => set('branchName')(e.target.value)} /></div>
                <div className="field"><label htmlFor="onb-bcity">Branch city</label>
                  <select id="onb-bcity" className="select" value={form.branchCity} onChange={e => set('branchCity')(e.target.value)}>{NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="field"><label htmlFor="onb-deps">Departments (comma-separated)</label>
                <input id="onb-deps" className="input" value={form.departments} onChange={e => set('departments')(e.target.value)} placeholder="ICT, Bursary, Admin" /></div>
              <p className="hint">You can add more branches and departments later under Administration.</p>
            </div>
          )}

          <div className="row between">
            {step > 0
              ? <button className="btn ghost" onClick={() => setStep(((step - 1) as Step))}><Icon name="chevronL" size={14} /> Back</button>
              : <Link to="/login" className="btn ghost"><Icon name="chevronL" size={14} /> Sign in instead</Link>}
            {step < 2
              ? <button className="btn" disabled={!stepOk} onClick={() => setStep(((step + 1) as Step))}>Continue <Icon name="chevronR" size={14} /></button>
              : <button className="btn" disabled={!stepOk} onClick={finish}>Create workspace</button>}
          </div>
        </div>
      </main>
      <aside className="auth-aside" aria-hidden>
        <div className="hero-glow" style={{ bottom: -300, left: -200, top: 'auto', right: 'auto', opacity: .3 }} />
        <div style={{ position: 'relative' }}>
          <div className="mkt-eyebrow" style={{ color: '#7db3ff' }}>Built-in guardrails</div>
          <h2 style={{ fontSize: 26, maxWidth: '20ch' }}>Your workspace ships with best practice</h2>
          <ul className="feature-list" style={{ marginTop: 16, color: '#b8c8e2', gap: 12 }}>
            {[
              'Business-hours SLA policy (WAT, Mon–Fri) ready to tune',
              'RBAC with 13 roles out of the box',
              'Every change lands in an immutable audit trail',
              'Nigerian tax rules baked into invoicing',
            ].map(x => <li key={x}>{x}</li>)}
          </ul>
        </div>
        <div className="sm" style={{ color: '#5c7190', position: 'relative' }}>Questions? support@techpros.com.ng</div>
      </aside>
    </div>
  );
}

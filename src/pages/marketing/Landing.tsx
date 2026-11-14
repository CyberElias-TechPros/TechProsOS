/** Public landing — showpiece: Aurora hero, masked-line headline, velocity marquee, spotlight cards. */
import { useLayoutEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { Icon, type IconName } from '../../components/icons';
import { MktNav, MktFooter } from './chrome';
import { Aurora } from '../../components/bits/Aurora';
import { BlurText, GradientText, ShinyText } from '../../components/bits/BlurText';
import { CountUp } from '../../components/bits/CountUp';
import { ClickSpark, Magnet, SpotlightCard, StarBorder, Tilt } from '../../components/bits/SpotlightCard';
import { ScrollVelocity } from '../../components/bits/ScrollVelocity';
import { Reveal, StaggerGroup } from '../../app/motion';

const MODULES: { icon: IconName; title: string; body: string; tag: string }[] = [
  { icon: 'tickets', title: 'Service desk, SLAs that hold', body: 'Impact × urgency priority matrix, business-hours SLA clocks in WAT, escalation and CSAT — not just a ticket list.', tag: 'ITSM' },
  { icon: 'assets', title: 'Asset & inventory command', body: 'Every laptop, UPS and firewall tracked to a branch and person, with QR labels, depreciation and warranty alerts.', tag: 'CMDB' },
  { icon: 'infra', title: 'Monitoring built for NOCs', body: 'Live topology, device health, alerts that become incidents automatically — designed for dark control-room screens.', tag: 'NOC' },
  { icon: 'projects', title: 'Projects with budget truth', body: 'Deployments and rollouts with kanban boards, milestones and spend burn — not spreadsheets in a drive folder.', tag: 'PMO' },
  { icon: 'compliance', title: 'Compliance, NDPA-ready', body: 'ISO 27001, NIST CSF and NDPA evidence trails with risk registers — audit season stops being a fire drill.', tag: 'GRC' },
  { icon: 'finance', title: 'Speak naira, fluently', body: 'Invoices with 7.5% VAT and 5%/10% WHT handled correctly. Budgets, expenses and cost centres your CFO understands.', tag: 'FIN' },
];

const PROOF = [
  { v: 99.7, suffix: '%', decimals: 1, label: 'SLA compliance, one click away' },
  { v: 40, suffix: '%', label: 'Lighter pages than typical suites' },
  { v: 15, suffix: '', label: 'Modules that share one data fabric' },
  { v: 13, suffix: '', label: 'Roles with least-privilege defaults' },
];

const LOOP_ITEMS = ['Service Desk', 'Asset Register', 'NOC Topology', 'Preventive Maintenance', 'Client Console', 'Project Delivery', 'Knowledge Base', 'Risk Register', 'Procurement', 'Naira Invoicing', 'AI Assistant', 'Audit Trail'];

function HeroCard() {
  return (
    <Tilt intensity={7} scale={1.01} className="hero-card-tilt">
      <div className="hero-mock" aria-hidden>
        <div className="hm-top"><span /><span /><span /><b>Greenfield Academy · Service Desk</b></div>
        <div className="hm-kpis">
          {[['SLA to respond', '47m left', 'ok'], ['Open critical', '1', 'bad'], ['Availability', '99.3%', 'ok']].map(([l, v, t]) => (
            <div key={l} className="hm-kpi"><span className="hm-l">{l}</span><b className={t}>{v}</b></div>
          ))}
        </div>
        <div className="hm-rows">
          {[
            ['TKT-1030', 'Storage 92% — archive recommended', 'critical', 'Breaching in 40m'],
            ['TKT-1025', 'Wi-Fi drops around Block B science labs', 'high', 'Assigned · Yusuf A.'],
            ['TKT-1022', 'Setup accounts for 3 new bursary staff', 'medium', 'In progress'],
          ].map(([n, t, p, s]) => (
            <div key={n} className="hm-row"><span className="hm-num">{n}</span><span className="hm-t">{t}</span><span className={`hm-pill ${p}`}>{p}</span><span className="hm-s">{s}</span></div>
          ))}
        </div>
        <div className="hm-foot"><i /> <span>Business-hours SLA · WAT calendar · Mon–Sat</span></div>
      </div>
    </Tilt>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = heroRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el.querySelectorAll('.clip-inner'),
        { yPercent: 112 },
        { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.13, delay: 0.2 });
      gsap.fromTo(el.querySelector('.hero-mock'),
        { opacity: 0, y: 34, rotateX: 6 },
        { opacity: 1, y: 0, rotateX: 0, duration: 1.15, ease: 'expo.out', delay: 0.55, clearProps: 'opacity' });
      gsap.fromTo(el.querySelectorAll('.hero-trust span'),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, delay: 1.05, ease: 'power2.out' });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div className="mkt">
      <MktNav />

      <section className="mkt-hero hero-v2" ref={heroRef}>
        <div className="hero-bg" aria-hidden>
          <Aurora colors={['#0a1733', '#1d63ed', '#22d3ee']} intensity={0.8} speed={0.45} />
          <div className="hero-grid-bg" />
        </div>
        <div className="inner hero-split">
          <div>
            <div className="hero-eyebrow clip-line"><span className="clip-inner">
              <ShinyText text="IT OPERATIONS · SERVICE DELIVERY · NIGERIA-FIRST" shineDelay={4} />
            </span></div>
            <h1 className="hero-h1" aria-label="Your technology, under control.">
              <span className="clip-line" aria-hidden="true"><span className="clip-inner">Your technology,</span></span>
              <span className="clip-line" aria-hidden="true"><span className="clip-inner hero-grad">under control.</span></span>
            </h1>
            <BlurText
              className="lede"
              text="TechPros One is the IT operations platform built for Nigerian schools, hospitals, corporates and the service providers who keep them running. Tickets, assets, monitoring, procurement and reports — one workspace, priced in naira."
              animateBy="words" stepMs={26} delay={900} as="p"
            />
            <div className="row hero-cta">
              <Magnet strength={10}>
                <ClickSpark sparkColor="#ffd166">
                  <StarBorder beamColor="#ffd166" duration={3.4} onClick={() => navigate('/signup')}>
                    Start your organisation <Icon name="arrowRight" size={15} />
                  </StarBorder>
                </ClickSpark>
              </Magnet>
              <Magnet strength={10}>
                <Link to="/login" className="btn lg hero-ghost">Explore the live demo</Link>
              </Magnet>
            </div>
            <div className="row hero-trust">
              {['Set up in a day', 'NDPA-ready trails', 'No card required'].map(x => (
                <span key={x}><Icon name="check" size={13} style={{ color: '#34d399' }} /> {x}</span>
              ))}
            </div>
          </div>
          <HeroCard />
        </div>
      </section>

      <section className="loop-band" aria-hidden>
        <ScrollVelocity baseVelocity={46}>
          {LOOP_ITEMS.map(x => (
            <span key={x} className="loop-item"><Icon name="zap" size={13} />{x}</span>
          ))}
        </ScrollVelocity>
      </section>

      <section className="mkt-section">
        <Reveal>
          <div className="mkt-eyebrow">One platform, every discipline</div>
          <h2 className="mkt-h2">Fifteen modules that <GradientText>finally talk to each other</GradientText></h2>
          <p className="mkt-sub">An alert becomes an incident. An incident consumes an asset record. The resolution updates the knowledge base, and the report lands on the executive dashboard. No export-import gymnastics.</p>
        </Reveal>
        <div className="grid-3 module-grid">
          {MODULES.map((m, i) => (
            <Reveal key={m.title} delay={i * 0.06}>
              <SpotlightCard className="pad-lg module-card" spotlightColor="rgba(90,162,255,.14)">
                <div className="module-head">
                  <span className="module-ico"><Icon name={m.icon} size={19} /></span>
                  <span className="module-tag">{m.tag}</span>
                </div>
                <h3>{m.title}</h3>
                <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65 }}>{m.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mkt-section dual-band">
        <div className="card pad-lg dual-card">
          <Aurora colors={['#06101f', '#0e3f8f', '#0ea5e9']} intensity={0.55} speed={0.35} />
          <div className="grid-2" style={{ position: 'relative' }}>
            <div className="stack" style={{ gap: 16 }}>
              <div className="mkt-eyebrow" style={{ color: '#7db3ff', margin: 0 }}>Two workspaces, one fabric</div>
              <h2 style={{ fontSize: 27, letterSpacing: '-.02em', margin: 0 }}>Organisations run their IT.<br />Providers run everyone’s.</h2>
              <p style={{ color: '#9db3d4', fontSize: 14.5, lineHeight: 1.7, maxWidth: '48ch' }}>
                A school’s IT manager sees their branches. Their MSP logs into the provider console
                and sees every client — the same tickets, assets and SLAs, isolated per tenant with
                delegated access.
              </p>
              <div className="row">
                <Magnet strength={8}>
                  <ClickSpark sparkColor="#7dd3fc">
                    <Link to="/signup" className="btn" style={{ boxShadow: '0 6px 24px rgba(37,99,235,.4)' }}>Open a provider workspace</Link>
                  </ClickSpark>
                </Magnet>
              </div>
            </div>
            <StaggerGroup className="grid audience-grid">
              {[
                ['Schools & colleges', 'Exam-season uptime, asset registers for bursars.'],
                ['Hospitals & clinics', 'HIS queues, biomedical maintenance, NDPA records.'],
                ['Banks & corporates', 'Multi-branch SLAs, auditor-grade evidence.'],
                ['ISPs & MSPs', 'A whole provider console: clients, contracts, field ops.'],
                ['SMEs & NGOs', 'Enterprise discipline at Lagos prices, on 3G-friendly pages.'],
                ['Public sector', 'Procurement trails that survive visibility.'],
              ].map(([t, b]) => (
                <Tilt key={t} intensity={6} scale={1.01}>
                  <div className="audience-chip">
                    <b className="sm">{t}</b>
                    <p className="xs" style={{ marginTop: 4, lineHeight: 1.55 }}>{b}</p>
                  </div>
                </Tilt>
              ))}
            </StaggerGroup>
          </div>
        </div>
      </section>

      <section className="mkt-section stat-band">
        <StaggerGroup className="stat-strip" step={0.1}>
          {PROOF.map(p => (
            <div key={p.label} className="stat-cell">
              <div className="stat-num">
                <CountUp to={p.v} decimals={p.decimals ?? 0} suffix={p.suffix} />
              </div>
              <div className="sm muted">{p.label}</div>
            </div>
          ))}
        </StaggerGroup>
      </section>

      <section className="mkt-section" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 90 }}>
        <BlurText text="PRICED IN NAIRA" animateBy="letters" stepMs={40} className="mkt-eyebrow" />
        <Reveal>
          <h2 className="mkt-h2" style={{ margin: '0 auto', textAlign: 'center' }}>
            No dollar surprises<br />when <GradientText colors={['#22d3ee', '#5aa2ff', '#a78bfa', '#22d3ee']}>FX moves.</GradientText>
          </h2>
          <p className="mkt-sub" style={{ margin: '12px auto 0' }}>From ₦19,500/month for organisations and ₦49,500/month for service providers.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 26, gap: 14 }}>
            <Magnet strength={9}>
              <ClickSpark>
                <StarBorder onClick={() => navigate('/pricing')}>See plans & pricing</StarBorder>
              </ClickSpark>
            </Magnet>
            <Link to="/free-tools" className="btn lg secondary">Use the free IT tools</Link>
          </div>
        </Reveal>
      </section>

      <MktFooter />
    </div>
  );
}

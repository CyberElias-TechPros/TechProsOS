/** Public landing — editorial hero + proof. Elegant, light-touch motion. */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon, type IconName } from '../../components/icons';
import { MktNav, MktFooter, reveal, stagger } from './chrome';

const MODULES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'tickets', title: 'Service desk, SLAs that hold', body: 'Impact × urgency priority matrix, business-hours SLA clocks in West African Time, escalation and CSAT — not just a ticket list.' },
  { icon: 'assets', title: 'Asset & inventory command', body: 'Every laptop, UPS and firewall tracked to a branch and person, with QR labels, depreciation and warranty alerts.' },
  { icon: 'infra', title: 'Monitoring built for NOCs', body: 'Live topology, device health, and alerts that become incidents automatically — designed for dark control-room screens.' },
  { icon: 'finance', title: 'Speak naira, fluently', body: 'Invoices with 7.5% VAT and 5%/10% WHT handled correctly. Budgets, expenses and cost centres your CFO understands.' },
  { icon: 'compliance', title: 'Compliance, NDPA-ready', body: 'ISO 27001, NIST CSF and NDPA evidence trails with risk registers and findings — audit season stops being a fire drill.' },
  { icon: 'ai', title: 'An assistant that knows the data', body: 'Ask “which sites breached SLA this month?” and get an answer grounded in your live numbers — with links to act.' },
];

const AUDIENCES = [
  ['Schools & colleges', 'Wireless estates, exam-season uptime, asset registers for bursars.'],
  ['Hospitals & clinics', 'HIS support queues, biomedical equipment maintenance, NDPA-sensitive records.'],
  ['Banks & corporates', 'Multi-branch SLAs, capacity budgets, auditor-grade evidence.'],
  ['ISPs & MSPs', 'A whole service-provider workspace: clients, contracts, field engineers, billing.'],
  ['SMEs & NGOs', 'Enterprise discipline at Lagos-friendly prices, on 3G-friendly pages.'],
];

export default function LandingPage() {
  return (
    <div className="mkt">
      <MktNav />

      <section className="mkt-hero">
        <div className="hero-grid-bg" aria-hidden />
        <div className="hero-glow" aria-hidden />
        <div className="inner">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div variants={reveal} className="mkt-eyebrow" style={{ color: '#7db3ff' }}>
              IT operations · Service delivery · Business technology
            </motion.div>
            <motion.h1 variants={reveal}>
              Run IT like the<br />business depends on it.<br /><span style={{ color: '#7db3ff' }}>Because it does.</span>
            </motion.h1>
            <motion.p variants={reveal} className="lede">
              TechPros One is the IT operations platform built for Nigerian schools, hospitals,
              corporates and the service providers who keep them running. Tickets, assets, monitoring,
              procurement and reports — one workspace, priced in naira, honest about power and bandwidth.
            </motion.p>
            <motion.div variants={reveal} className="row" style={{ marginTop: 26, gap: 12 }}>
              <Link to="/signup" className="btn lg" style={{ boxShadow: '0 6px 24px rgba(37,99,235,.45)' }}>
                Start your organisation <Icon name="arrowRight" size={16} />
              </Link>
              <Link to="/login" className="btn lg secondary" style={{ background: 'rgba(255,255,255,.08)', color: '#e9f0fb', borderColor: 'rgba(255,255,255,.18)' }}>
                Explore the live demo
              </Link>
            </motion.div>
            <motion.div variants={reveal} className="row" style={{ marginTop: 30, gap: 22 }}>
              {['Set up in a day', 'NDPA-ready trails', 'Mobile-first & low-data'].map(x => (
                <span key={x} className="sm" style={{ color: '#9db3d4', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="check" size={14} style={{ color: '#34d399' }} /> {x}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="mkt-section">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
          <motion.div variants={reveal} className="mkt-eyebrow">One platform, every discipline</motion.div>
          <motion.h2 variants={reveal} className="mkt-h2">Fifteen modules that finally talk to each other</motion.h2>
          <motion.p variants={reveal} className="mkt-sub">
            An alert becomes an incident. An incident consumes an asset record. The resolution updates the knowledge base,
            the report lands on the executive dashboard. No export-import gymnastics.
          </motion.p>
          <motion.div variants={stagger} className="grid-3" style={{ marginTop: 34 }}>
            {MODULES.map(m => (
              <motion.div key={m.title} variants={reveal} className="card pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon name={m.icon} size={20} />
                </span>
                <h3>{m.title}</h3>
                <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{m.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 0 }}>
        <div className="card pad-lg" style={{ background: 'var(--ink)', color: 'var(--ink-fg)', border: 'none', overflow: 'hidden', position: 'relative' }}>
          <div className="hero-glow" style={{ opacity: .4, top: -400, right: -200 }} aria-hidden />
          <div className="grid-2" style={{ position: 'relative' }}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="mkt-eyebrow" style={{ color: '#7db3ff', margin: 0 }}>Two workspaces, one fabric</div>
              <h2 style={{ fontSize: 27, letterSpacing: '-.02em' }}>Organisations run their IT.<br />Providers run everyone’s.</h2>
              <p style={{ color: '#9db3d4', fontSize: 14.5, lineHeight: 1.7 }}>
                A school’s IT manager sees their branches. Their MSP logs into the provider
                console and sees every client — with the same tickets, assets and SLAs,
                isolated per tenant with delegated access.
              </p>
              <div className="row"><Link to="/signup" className="btn">Open a provider workspace</Link></div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', alignContent: 'center' }}>
              {AUDIENCES.map(([t, b]) => (
                <div key={t} className="card flat" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
                  <b className="sm" style={{ color: '#e9f0fb' }}>{t}</b>
                  <p className="xs" style={{ color: '#93a7c4', marginTop: 4, lineHeight: 1.5 }}>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 0 }}>
        <div className="stat-strip" style={{ justifyContent: 'space-around', textAlign: 'center', gap: 30 }}>
          {[
            ['99.7%', 'SLA compliance visible in one click'],
            ['40%', 'lighter pages than typical enterprise suites'],
            ['₦', 'Native invoicing — VAT & WHT done right'],
            ['13', 'roles with least-privilege defaults'],
          ].map(([v, l]) => (
            <div key={l} style={{ alignItems: 'center', maxWidth: 200 }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--accent)' }}>{v}</div>
              <div className="sm muted">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mkt-section" style={{ textAlign: 'center', paddingTop: 10 }}>
        <div className="mkt-eyebrow">Pricing</div>
        <h2 className="mkt-h2" style={{ margin: '0 auto' }}>Honest naira pricing. No dollar surprises when FX moves.</h2>
        <p className="mkt-sub" style={{ margin: '10px auto 0' }}>Plans from ₦19,500/month for small organisations and ₦49,500/month for service providers.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link to="/pricing" className="btn lg">See plans & pricing</Link>
          <Link to="/free-tools" className="btn lg secondary">Use the free IT tools</Link>
        </div>
      </section>

      <MktFooter />
    </div>
  );
}

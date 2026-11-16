/** Pricing — organisation + MSP tracks, ₦-native, per README pricing table. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui';

import { MktNav, MktFooter } from './chrome';
import { CountUp } from '../../components/bits/CountUp';
import { SpotlightCard } from '../../components/bits/SpotlightCard';
import { BlurText, GradientText } from '../../components/bits/BlurText';
import { Reveal } from '../../app/motion';

const ORG_PLANS = [
  { id: 'starter', name: 'Starter', price: 19_500, blurb: 'Small teams getting tickets and assets under control.', feats: ['5 users · 100 assets', 'Service desk + SLA engine', 'Asset register with QR labels', 'Service reports (PDF)'] },
  { id: 'professional', name: 'Professional', price: 59_500, featured: true, blurb: 'Growing organisations with branches and a real IT team.', feats: ['20 users · 1,000 assets', 'Everything in Starter', 'Monitoring & NOC topology', 'Procurement + budgets', 'Compliance evidence packs'] },
  { id: 'business', name: 'Business', price: 149_500, blurb: 'Multi-branch estates with governance needs.', feats: ['75 users · 5,000 assets', 'Everything in Professional', 'Custom report builder', 'Advanced RBAC & audit trail', 'AI assistant credits'] },
  { id: 'enterprise', name: 'Enterprise', custom: true, blurb: 'Banks, hospital groups and multi-state operations.', feats: ['Unlimited scale', 'SSO & dedicated support', 'Custom integrations', 'On-site onboarding in Lagos'] },
];
const MSP_PLANS = [
  { id: 'msp_launch', name: 'Launch', price: 49_500, blurb: 'A young MSP professionalising its first accounts.', feats: ['5 client organisations', '10 staff seats', 'Shared SLA policies', 'Client-branded reports'] },
  { id: 'msp_growth', name: 'Growth', price: 125_000, featured: true, blurb: 'Established providers with field engineers.', feats: ['20 clients · 35 seats', 'Everything in Launch', 'Cross-client analytics', 'Field-service scheduling'] },
  { id: 'msp_scale', name: 'Scale', price: 299_000, blurb: 'Multi-city operations with account teams.', feats: ['60 clients · 90 seats', 'Everything in Growth', 'White-label portal', 'Priority support'] },
  { id: 'msp_enterprise', name: 'Enterprise', custom: true, blurb: 'Carriers and national integrators.', feats: ['Unlimited clients & seats', 'SSO and residency options', 'Custom contracts'] },
];

export default function PricingPage() {
  const [track, setTrack] = useState<'organisation' | 'provider'>('organisation');
  const [annual, setAnnual] = useState(false);
  const plans = track === 'organisation' ? ORG_PLANS : MSP_PLANS;
  return (
    <div className="mkt">
      <MktNav />
      <section className="mkt-section" style={{ paddingTop: 56 }}>
        <BlurText text="PRICING" animateBy="letters" stepMs={36} className="mkt-eyebrow" />
        <h1 className="mkt-h2">Priced in naira. <GradientText>Designed for this market.</GradientText></h1>
        <p className="mkt-sub">
          Every plan includes the SLA engine, audit trails, QR asset labels, free software updates and Lagos phone support.
          Prices exclude VAT (7.5%). Pay monthly or annually — two months free on annual.
        </p>
        <div className="row" style={{ gap: 12, margin: '22px 0', flexWrap: 'wrap' }}>
          <div className="seg" role="tablist">
            <button aria-pressed={track === 'organisation'} onClick={() => setTrack('organisation')}>For organisations</button>
            <button aria-pressed={track === 'provider'} onClick={() => setTrack('provider')}>For IT service providers</button>
          </div>
          <div className="seg" role="tablist" aria-label="Billing period">
            <button aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button>
            <button aria-pressed={annual} onClick={() => setAnnual(true)}>Annual · 2 months free</button>
          </div>
        </div>
        <div className="grid-4">
          {plans.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.06}>
              <SpotlightCard className={`pad-lg pricing-card ${p.featured ? 'featured' : ''}`} spotlightColor="rgba(90,162,255,.15)">
                <div className="row between">
                  <b style={{ fontSize: 16, fontFamily: 'var(--font-display)' }}>{p.name}</b>
                  {p.featured && <Badge tone="accent">Popular</Badge>}
                </div>
                {'price' in p && p.price
                  ? <div className="price">
                      ₦<CountUp to={annual ? Math.round(p.price * 10 / 12) : p.price} duration={1.2} /><span>/mo</span>
                      {annual && <span style={{ display: 'block' }}>billed ₦{(p.price * 10).toLocaleString('en-NG')}/yr</span>}
                    </div>
                  : <div className="price" style={{ fontSize: 24 }}>Custom</div>}
                <p className="muted sm" style={{ minHeight: 40 }}>{p.blurb}</p>
                <ul className="feature-list">{p.feats.map(f => <li key={f}>{f}</li>)}</ul>
                <Link to={`/signup?plan=${p.id}&type=${track === 'provider' ? 'service_provider' : 'organisation'}`}
                  className={`btn block ${p.featured ? '' : 'secondary'}`} style={{ marginTop: 'auto' }}>
                  {p.custom ? 'Talk to us' : 'Start free trial'}
                </Link>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
        <p className="note info" style={{ marginTop: 24, maxWidth: 720 }}>
          Education and registered NGO discounts: 30%. Trials run 14 days with demo data you can purge in one click.
          No card required to start.
        </p>
      </section>
      <MktFooter />
    </div>
  );
}

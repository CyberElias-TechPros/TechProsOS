/** Marketing chrome — nav/footer shared by public pages + motion variants. */
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Variants } from 'framer-motion';
import { Icon } from '../../components/icons';
import { useSessionInfo } from '../../platform/session';

export const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/free-tools', label: 'Free tools' },
];

export function MktNav() {
  const [open, setOpen] = useState(false);
  const session = useSessionInfo();
  return (
    <header className="mkt-nav no-print">
      <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none' }}>
        <span className="brand-mark">TP</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)', fontFamily: 'var(--font-display)' }}>TechPros One</span>
      </Link>
      <nav className="links" aria-label="Primary">
        {NAV_LINKS.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => isActive ? 'active' : ''}>{l.label}</NavLink>
        ))}
        {session
          ? <Link to="/app/overview" className="btn sm">Open workspace <Icon name="arrowRight" size={13} /></Link>
          : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <Link to="/signup" className="btn sm">Start free</Link>
            </>
          )}
      </nav>
      <button className="icon-btn burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.8} strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div className="mkt-nav-drawer" role="dialog" aria-label="Menu" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet">
            {NAV_LINKS.map(l => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>{l.label}</NavLink>
            ))}
            {session
              ? <Link to="/app/overview" className="btn block sm" onClick={() => setOpen(false)}>Open workspace</Link>
              : <>
                <Link to="/login" onClick={() => setOpen(false)}>Sign in</Link>
                <Link to="/signup" className="btn block sm" onClick={() => setOpen(false)}>Start free</Link>
              </>}
          </div>
        </div>
      )}
    </header>
  );
}

export function MktFooter() {
  return (
    <footer className="mkt-footer no-print">
      <div className="inner">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none' }}>
              <span className="brand-mark">TP</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)', fontFamily: 'var(--font-display)' }}>TechPros One</span>
            </Link>
            <p>The IT operations platform for West African organisations and the service providers who keep them running.</p>
          </div>
          <div className="foot-col">
            <h5>Product</h5>
            <ul>
              <li><Link to="/pricing">Plans &amp; pricing</Link></li>
              <li><Link to="/free-tools">Free IT tools</Link></li>
              <li><Link to="/signup">Start a workspace</Link></li>
              <li><Link to="/login">Sign in</Link></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Modules</h5>
            <ul>
              <li>Service desk &amp; SLAs</li>
              <li>Assets &amp; maintenance</li>
              <li>Monitoring &amp; NOC</li>
              <li>Finance &amp; compliance</li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Legal</h5>
            <ul>
              <li><Link to="/terms">Terms of service</Link></li>
              <li><Link to="/privacy">Privacy notice</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="foot-bottom">
        <span>© {new Date().getFullYear()} DELGRA LTD (RC 9379032), trading as TechPros · Lagos, Nigeria</span>
        <span>Built for West African businesses · support@techpros.com.ng</span>
      </div>
    </footer>
  );
}

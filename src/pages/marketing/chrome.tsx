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

export function MktNav() {
  const [open, setOpen] = useState(false);
  const session = useSessionInfo();
  return (
    <header className="mkt-nav no-print">
      <Link to="/" className="row nowrap" style={{ gap: 9, textDecoration: 'none' }}>
        <span className="brand-mark">TP</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>TechPros One</span>
      </Link>
      <nav className="links" aria-label="Primary">
        <NavLink to="/pricing">Pricing</NavLink>
        <NavLink to="/free-tools">Free tools</NavLink>
        {open ? null : null}
        {session
          ? <Link to="/app/overview" className="btn sm">Open workspace <Icon name="arrowRight" size={13} /></Link>
          : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <Link to="/signup" className="btn sm">Start free</Link>
            </>
          )}
      </nav>
      <button className="icon-btn" style={{ display: 'none' }} aria-label="menu" onClick={() => setOpen(!open)} />
    </header>
  );
}

export function MktFooter() {
  return (
    <footer className="mkt-footer no-print">
      <div className="inner">
        <span>© {new Date().getFullYear()} TechPros Services Ltd · Lagos, Nigeria · Built for West African businesses</span>
        <span className="row" style={{ gap: 16 }}>
          <Link to="/pricing">Pricing</Link>
          <Link to="/free-tools">Free tools</Link>
          <Link to="/signup">Get started</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  );
}

/** Shared shell for public legal notices, so terms and privacy read consistently. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MktNav, MktFooter } from '../marketing/chrome';

export const LEGAL_ENTITY = 'DELGRA LTD';
export const LEGAL_TRADING = 'TechPros';
export const LEGAL_RC = '9379032';
export const LEGAL_UPDATED = '15 November 2026';

export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <MktNav />
      <main className="mkt-section" style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 56px' }}>
        <div className="stack" style={{ gap: 10 }}>
          <span className="lbl">{LEGAL_ENTITY} trading as {LEGAL_TRADING} · RC {LEGAL_RC}</span>
          <h1 style={{ fontSize: 30, lineHeight: 1.2 }}>{title}</h1>
          <p className="muted">Last updated {LEGAL_UPDATED}</p>
          <p className="sm" style={{ lineHeight: 1.7 }}>{intro}</p>
        </div>
        <div className="stack legal-body" style={{ gap: 22, marginTop: 28 }}>{children}</div>
        <div className="card pad-lg stack" style={{ marginTop: 32 }}>
          <b className="sm">Questions about this notice?</b>
          <p className="xs muted">Contact your workspace administrator, who can reach our data protection contact on your behalf. Workspace owners can also raise a formal request from Admin → Privacy.</p>
          <div className="row" style={{ gap: 10 }}>
            <Link className="btn sm secondary" to="/privacy">Privacy notice</Link>
            <Link className="btn sm ghost" to="/terms">Terms of service</Link>
          </div>
        </div>
      </main>
      <MktFooter />
    </>
  );
}

export function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2 style={{ fontSize: 18 }}>{n}. {title}</h2>
      <div className="stack sm" style={{ gap: 8, lineHeight: 1.7, color: 'var(--muted)' }}>{children}</div>
    </section>
  );
}

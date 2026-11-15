/**
 * Landing surface for the Paystack redirect.
 *
 * Paystack returns the customer to /app/admin?billing=verify&reference=… (or billing=cancelled).
 * Nothing used to read those params, so a successful payment left the workspace showing the
 * old plan until a manual reload. This banner settles the checkout server-side and refreshes.
 *
 * The browser never decides whether a payment succeeded — it only asks the server to verify
 * with Paystack. The webhook is the authoritative path; this is the fast user-facing one, and
 * both converge on the same idempotent settleCheckout.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../platform/api';
import { useLiveAuth } from '../../platform/session';
import { useData } from '../../platform/store';
import { Icon } from '../../components/icons';

type State = { kind: 'verifying' | 'paid' | 'pending' | 'cancelled' | 'error'; message?: string };

export function BillingReturn() {
  const [params, setParams] = useSearchParams();
  const billing = params.get('billing');
  const reference = params.get('reference');
  const mode = useData(s => s.mode);
  const refresh = useLiveAuth(s => s.refresh);
  const [state, setState] = useState<State>({ kind: 'verifying' });
  // StrictMode double-invokes effects in dev; verification must run once per reference.
  const started = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('billing'); next.delete('reference'); next.delete('trxref');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!billing) return;
    if (billing === 'cancelled') { setState({ kind: 'cancelled' }); return; }
    if (billing !== 'verify' || !reference) return;
    if (mode !== 'live') { setState({ kind: 'pending', message: 'Demo mode does not take real payments.' }); return; }
    const key = `${reference}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    let alive = true;
    setState({ kind: 'verifying' });
    (async () => {
      try {
        const result = await api.verifyBilling(reference);
        if (!alive) return;
        if (result.status === 'paid') { await refresh(); if (alive) setState({ kind: 'paid' }); }
        else setState({ kind: 'pending' });
      } catch (error) {
        if (alive) setState({ kind: 'error', message: (error as Error).message });
      }
    })();
    return () => { alive = false; };
  }, [billing, reference, mode, refresh, attempt]);

  if (!billing) return null;

  const tone = state.kind === 'paid' ? 'good' : state.kind === 'error' ? 'bad' : 'info';
  const icon = state.kind === 'paid' ? 'check' : state.kind === 'error' ? 'incident' : 'clock';
  const title = {
    verifying: 'Confirming your payment…',
    paid: 'Payment confirmed',
    pending: 'Payment not confirmed yet',
    cancelled: 'Checkout cancelled',
    error: 'Could not confirm payment',
  }[state.kind];
  const body = {
    verifying: 'Checking with Paystack. This usually takes a moment.',
    paid: 'Your workspace has been updated. Thank you.',
    pending: state.message ?? 'If you completed payment, confirmation can take a minute. Your workspace updates automatically once it arrives.',
    cancelled: 'No charge was made. You can start checkout again whenever you are ready.',
    error: state.message ?? 'Something went wrong while verifying.',
  }[state.kind];

  return (
    <div className={`card pad-lg row between no-print banner-${tone}`} role="status" aria-live="polite">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <Icon name={icon} size={16} />
        <div>
          <div className="b sm">{title}</div>
          <div className="xs muted">{body}</div>
          {reference && <div className="xs faint mono" style={{ marginTop: 4 }}>Reference {reference}</div>}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {state.kind === 'error' && reference && mode === 'live' && (
          <button className="btn sm secondary" onClick={() => setAttempt(a => a + 1)}>Retry</button>
        )}
        {state.kind === 'pending' && reference && mode === 'live' && (
          <button className="btn sm secondary" onClick={() => setAttempt(a => a + 1)}>Check again</button>
        )}
        {state.kind !== 'verifying' && <button className="btn sm ghost" onClick={clear} aria-label="Dismiss">Dismiss</button>}
      </div>
    </div>
  );
}

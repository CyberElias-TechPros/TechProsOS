/**
 * Connectivity notice for live workspaces.
 *
 * Previously a dropped connection was invisible until a submit failed, so a user could compose a
 * long reply and only then learn it was never sent. This warns while they are still typing.
 *
 * Deliberately says "changes are not being saved" rather than buffering writes: silently queueing
 * mutations and replaying them later would risk duplicate or out-of-order commands against a
 * revision-checked API. The honest behaviour is to stop and let the user retry deliberately.
 */
import { useEffect, useState } from 'react';
import { useData } from '../platform/store';
import { Icon } from './icons';

export function ConnectionBanner() {
  const mode = useData(s => s.mode);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  if (online || mode !== 'live') return null;
  return (
    <div className="note bad no-print" role="status" aria-live="polite"
      style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name="wifi" size={15} />
      <span className="sm"><b>You are offline.</b> Changes are not being saved. Reconnect before submitting — anything you send now will fail rather than queue.</span>
    </div>
  );
}

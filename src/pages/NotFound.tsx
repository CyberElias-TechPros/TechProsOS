/**
 * Explicit 404. Unknown paths used to redirect silently to '/', so a mistyped or stale link
 * looked like the app losing the user's place. Naming the path makes the failure diagnosable.
 */
import { Link, useLocation } from 'react-router-dom';

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="auth-wrap">
      <main className="auth-main">
        <div className="auth-card stack">
          <span className="lbl">404</span>
          <h1 style={{ fontSize: 22 }}>Page not found</h1>
          <p className="muted sm">
            Nothing is published at <code className="mono">{pathname}</code>. The link may be out of date,
            or the record may have moved to another workspace.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn" to="/app/overview">Go to dashboard</Link>
            <Link className="btn secondary" to="/">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default NotFound;

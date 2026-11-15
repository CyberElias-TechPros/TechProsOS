/**
 * Last-resort render guard.
 *
 * Without this, any throw during render unmounts the whole React tree: the user gets a white
 * screen with no explanation and no way back. A lazy route chunk that fails to load after a
 * deploy (stale hash) hits exactly this path.
 *
 * The raw error is deliberately not shown — stack traces leak internals and are useless to the
 * user. It is logged for diagnostics, and the UI offers a retry plus an escape hatch.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only: no external error service is configured, and user data must not be shipped.
    console.error('[TechPros] render failure', error.message, info.componentStack);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="auth-wrap">
        <main className="auth-main">
          <div className="auth-card stack" role="alert">
            <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
            <p className="muted sm">
              This screen could not be displayed. Your saved work is unaffected — nothing was submitted.
              Try again, and if it keeps happening reload the page or return to the dashboard.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={this.retry}>Try again</button>
              <a className="btn secondary" href="/app/overview">Go to dashboard</a>
              <a className="btn ghost" href="/">Home</a>
            </div>
          </div>
        </main>
      </div>
    );
  }
}

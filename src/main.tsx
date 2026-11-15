import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App';
import './styles/base.css';
import './styles/app.css';
import { useApplyTheme, useSessionInfo, useBootstrap, useLiveAuth } from './platform/session';
import { SessionProvider } from './platform/session';
import { ToastRegion, toast } from './components/ui';
import { ApiError } from './platform/api';
import { useLenis } from './app/motion';
import { isPublicRoute } from './platform/routes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConnectionBanner } from './components/ConnectionBanner';

function Root() {
  useApplyTheme();
  useLenis();
  useBootstrap();
  const { pathname } = useLocation();
  const status = useLiveAuth(s => s.status);
  const error = useLiveAuth(s => s.error);
  const info = useSessionInfo();
  const gate = !isPublicRoute(pathname);
  if (gate && status === 'loading') return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack"><div className="skeleton" style={{ height: 28, width: '60%' }} /><div className="skeleton" style={{ height: 120 }} /><p className="muted sm">Connecting securely…</p></div></main></div>;
  if (gate && status === 'error') return <div className="auth-wrap"><main className="auth-main"><div className="auth-card stack"><h1 style={{ fontSize: 22 }}>Service unavailable</h1><p className="muted sm">{error}</p><button className="btn" onClick={() => void useLiveAuth.getState().bootstrap()}>Retry</button><a className="btn secondary" href="/">Back to home</a></div></main></div>;
  return (
    <SessionProvider value={info}>
      <ConnectionBanner />
      <App session={info} />
      <ToastRegion />
    </SessionProvider>
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    if (reason instanceof ApiError) { toast(reason.message, 'bad'); event.preventDefault(); }
    else if (reason instanceof Error && /permission|denied|conflict|required|invalid|expired|not found/i.test(reason.message)) { toast(reason.message, 'bad'); event.preventDefault(); }
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

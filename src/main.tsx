import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/base.css';
import './styles/app.css';
import { useApplyTheme, useSessionInfo } from './platform/session';
import { SessionProvider } from './platform/session';
import { ToastRegion } from './components/ui';
import { useLenis } from './app/motion';

function Root() {
  useApplyTheme();
  useLenis();
  const info = useSessionInfo();
  return (
    <SessionProvider value={info}>
      <App session={info} />
      <ToastRegion />
    </SessionProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>,
);

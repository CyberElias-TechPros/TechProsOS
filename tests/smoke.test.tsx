/** Smoke tests — render the guarded workspace end to end and catch runtime crashes. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { resetWorkspaceData } from '../src/platform/store';
import { useSession, SessionProvider, useSessionInfo } from '../src/platform/session';
import { DEMO, DEMO_USERS } from '../src/platform/seed';
import Overview from '../src/pages/workspace/Overview';
import ServiceDesk from '../src/pages/workspace/ServiceDesk';
import TicketDetail from '../src/pages/workspace/TicketDetail';
import Assets from '../src/pages/workspace/Assets';
import Monitoring from '../src/pages/workspace/Monitoring';
import Finance from '../src/pages/workspace/Finance';
import Compliance from '../src/pages/workspace/Compliance';
import Assistant from '../src/pages/workspace/Assistant';

function Harness({ children }: { children: React.ReactNode }) {
  const info = useSessionInfo();
  return <SessionProvider value={info}>{info ? children : <div role="status">no-session</div>}</SessionProvider>;
}

function signIn(userId: string, tenantId: string) {
  useSession.setState({ userId, tenantId });
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceData();
  signIn(DEMO_USERS.emeka, DEMO.greenfield);
});

describe('page render matrix', () => {
  it('Overview', () => {
    const view = render(
      <MemoryRouter><Harness><Overview /></Harness></MemoryRouter>,
    );
    expect(view.container.textContent).toContain('Open tickets');
    expect(view.container.textContent).toContain('Emeka'); // greeting uses first name
  });
  it('ServiceDesk lists tickets in scope', () => {
    const view = render(<MemoryRouter><Harness><ServiceDesk /></Harness></MemoryRouter>);
    expect(view.container.textContent).toContain('TKT-');
  });
  it('TicketDetail renders a thread', () => {
    signIn(DEMO_USERS.ngozi, DEMO.greenfield); // IT manager: view.all scope
    const view = render(
      <MemoryRouter initialEntries={['/app/service-desk/tk_100']}>
        <Harness>
          <Routes><Route path="/app/service-desk/:id" element={<TicketDetail />} /></Routes>
        </Harness>
      </MemoryRouter>,
    );
    expect(view.container.textContent).toContain('TKT-1001');
    expect(view.container.textContent).toContain('Conversation');
  });
  it('Assets', () => {
    const view = render(<MemoryRouter><Harness><Assets /></Harness></MemoryRouter>);
    expect(view.container.textContent).toContain('TP-');
  });
  it('Monitoring NOC', () => {
    const view = render(<MemoryRouter><Harness><Monitoring /></Harness></MemoryRouter>);
    expect(view.container.textContent).toContain('Network operations centre');
  });
  it('Finance', () => {
    signIn(DEMO_USERS.femi, DEMO.greenfield);
    const view = render(<MemoryRouter><Harness><Finance /></Harness></MemoryRouter>);
    expect(view.container.textContent).toContain('Finance & IT cost');
  });
  it('Compliance heatmap', () => {
    signIn(DEMO_USERS.ngozi, DEMO.greenfield);
    const view = render(<MemoryRouter><Harness><Compliance /></Harness></MemoryRouter>);
    expect(view.container.textContent).toContain('compliance');
  });
  it('Assistant asks a grounded question', async () => {
    signIn(DEMO_USERS.chidera, DEMO.greenfield);
    render(<MemoryRouter><Harness><Assistant /></Harness></MemoryRouter>);
    fireEvent.click(screen.getByText('What are the most common problems?'));
    await new Promise(r => setTimeout(r, 500));
    expect(document.body.textContent).toContain('Basis:');
  });
  it('Employee persona sees only own tickets', () => {
    signIn(DEMO_USERS.tobi, DEMO.greenfield);
    const view = render(<MemoryRouter><Harness><ServiceDesk /></Harness></MemoryRouter>);
    expect(view.container.textContent).not.toContain('INV-');
  });
});

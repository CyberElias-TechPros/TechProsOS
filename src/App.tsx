/** Router — marketing surface, auth/onboarding, and the guarded workspace shell. */
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import type { SessionInfo } from './platform/session';
import type { Permission } from './platform/permissions';

// marketing + auth (eager: tiny)
import LandingPage from './pages/marketing/Landing';
import PricingPage from './pages/marketing/Pricing';
import LoginPage from './pages/auth/Login';
import OnboardingPage from './pages/auth/Onboarding';
import FreeToolsPage from './pages/marketing/FreeTools';

// workspace modules (lazy: chunky libs live here — recharts, qrcode)
const Overview = lazy(() => import('./pages/workspace/Overview'));
const ServiceDesk = lazy(() => import('./pages/workspace/ServiceDesk'));
const TicketDetail = lazy(() => import('./pages/workspace/TicketDetail'));
const NewTicket = lazy(() => import('./pages/workspace/NewTicket'));
const Assets = lazy(() => import('./pages/workspace/Assets'));
const AssetDetail = lazy(() => import('./pages/workspace/AssetDetail'));
const Maintenance = lazy(() => import('./pages/workspace/Maintenance'));
const Monitoring = lazy(() => import('./pages/workspace/Monitoring'));
const Projects = lazy(() => import('./pages/workspace/Projects'));
const ProjectDetail = lazy(() => import('./pages/workspace/ProjectDetail'));
const Clients = lazy(() => import('./pages/workspace/Clients'));
const ClientDetail = lazy(() => import('./pages/workspace/ClientDetail'));
const Docs = lazy(() => import('./pages/workspace/Docs'));
const Compliance = lazy(() => import('./pages/workspace/Compliance'));
const Procurement = lazy(() => import('./pages/workspace/Procurement'));
const Finance = lazy(() => import('./pages/workspace/Finance'));
const Reports = lazy(() => import('./pages/workspace/Reports'));
const Assistant = lazy(() => import('./pages/workspace/Assistant'));
const Tools = lazy(() => import('./pages/workspace/Tools'));
const Admin = lazy(() => import('./pages/workspace/Admin'));
const AuditTrail = lazy(() => import('./pages/workspace/AuditTrail'));
const NotificationsPage = lazy(() => import('./pages/workspace/Notifications'));

function Loading() {
  return (
    <div className="stack" style={{ paddingTop: 6 }}>
      <div className="skeleton" style={{ height: 30, width: '34%' }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  );
}

function RequireAuth({ session, children }: { session: SessionInfo | null; children: JSX.Element }) {
  const location = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function RequirePerm({ session, perm, children }: { session: SessionInfo; perm: Permission; children: JSX.Element }) {
  if (!session.can(perm)) return <Navigate to="/app/overview" replace />;
  return children;
}

export default function App({ session }: { session: SessionInfo | null }) {
  const guard = (perm: Permission, el: JSX.Element) =>
    session ? <RequirePerm session={session} perm={perm}>{el}</RequirePerm> : <Navigate to="/login" replace />;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* public marketing surface */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/free-tools" element={<FreeToolsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<OnboardingPage />} />

        {/* guarded workspace */}
        <Route path="/app" element={<RequireAuth session={session}><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={guard('itsm.ticket.view.own', <Overview />)} />
          <Route path="service-desk" element={guard('itsm.ticket.view.own', <ServiceDesk />)} />
          <Route path="service-desk/new" element={guard('itsm.ticket.create', <NewTicket />)} />
          <Route path="service-desk/:id" element={guard('itsm.ticket.view.own', <TicketDetail />)} />
          <Route path="assets" element={guard('assets.asset.view', <Assets />)} />
          <Route path="assets/:id" element={guard('assets.asset.view', <AssetDetail />)} />
          <Route path="maintenance" element={guard('maintenance.workorder.view', <Maintenance />)} />
          <Route path="monitoring" element={guard('infrastructure.device.view', <Monitoring />)} />
          <Route path="projects" element={guard('projects.project.view', <Projects />)} />
          <Route path="projects/:id" element={guard('projects.project.view', <ProjectDetail />)} />
          <Route path="clients" element={guard('clients.client.view', <Clients />)} />
          <Route path="clients/:id" element={guard('clients.client.view', <ClientDetail />)} />
          <Route path="docs" element={guard('docs.content.view', <Docs />)} />
          <Route path="compliance" element={guard('compliance.item.view', <Compliance />)} />
          <Route path="procurement" element={guard('procurement.po.view', <Procurement />)} />
          <Route path="finance" element={guard('finance.invoice.view', <Finance />)} />
          <Route path="reports" element={guard('reports.report.view', <Reports />)} />
          <Route path="assistant" element={guard('ai.assistant.use', <Assistant />)} />
          <Route path="tools" element={guard('tools.use', <Tools />)} />
          <Route path="admin" element={guard('admin.org', <Admin />)} />
          <Route path="admin/audit" element={guard('admin.audit', <AuditTrail />)} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/app/overview" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

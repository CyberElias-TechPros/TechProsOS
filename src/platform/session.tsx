/** Session resolution for demo (local personas) and live (server cookie) modes. */
import { create } from 'zustand';
import { persist as zustandPersist } from 'zustand/middleware';
import { useEffect } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ID, RoleId, Tenant, User } from './types';
import { accessContextFor, can, type AccessContext, type Permission } from './permissions';
import { accessibleTenantIds, userById } from './db';
import { useData, enterLive, clearClientData, enterDemo } from './store';
import { api, ApiError, setCsrfToken, readCsrfCookie, type PublicConfig } from './api';

interface DemoSessionState { userId: ID | null; tenantId: ID | null; signIn: (userId: ID, tenantId: ID) => void; switchTenant: (tenantId: ID) => void; signOut: () => void; setWorkspace: (userId: ID, tenantId: ID) => void }
export const useSession = create<DemoSessionState>()(zustandPersist(set => ({
  userId: null, tenantId: null,
  signIn: (userId, tenantId) => set({ userId, tenantId }),
  switchTenant: tenantId => set({ tenantId }),
  signOut: () => set({ userId: null, tenantId: null }),
  setWorkspace: (userId, tenantId) => set({ userId, tenantId }),
}), { name: 'techpros.session' }));

export interface LiveWorkspace { id: string; name: string; type: string; role: string; delegated: boolean }
interface LiveAuthState {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  config: PublicConfig | null; user: User | null; tenantId: string | null; workspaces: LiveWorkspace[]; error: string | null;
  bootstrap: () => Promise<void>; refresh: () => Promise<void>; completeLogin: (user: User, tenantId: string | null) => Promise<void>;
  switchWorkspace: (tenantId: string) => Promise<void>; signOut: () => Promise<void>;
}
export const useLiveAuth = create<LiveAuthState>((set, get) => ({
  status: 'loading', config: null, user: null, tenantId: null, workspaces: [], error: null,
  bootstrap: async () => {
    set({ status: 'loading', error: null });
    try {
      const config = await api.config(); set({ config });
      if (config.mode === 'demo') { enterDemo(); set({ status: 'anonymous', user: null, tenantId: null, workspaces: [] }); return; }
      if (config.setupRequired.length) { clearClientData(); set({ status: 'error', error: `Server setup required: ${config.setupRequired.join(', ')}` }); return; }
      setCsrfToken(readCsrfCookie());
      try {
        const session = await api.session();
        if (!session.tenantId) { set({ status: 'authenticated', user: session.user, tenantId: null, workspaces: session.workspaces }); clearClientData(); return; }
        const snapshot = await api.workspace(); enterLive(snapshot.data, snapshot.revision, snapshot.serverTime);
        set({ status: 'authenticated', user: session.user, tenantId: session.tenantId, workspaces: session.workspaces, error: null });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) { clearClientData(); set({ status: 'anonymous', user: null, tenantId: null, workspaces: [] }); return; }
        throw error;
      }
    } catch (error) { clearClientData(); set({ status: 'error', error: error instanceof Error ? error.message : 'Could not reach the server' }); }
  },
  refresh: async () => {
    if (useData.getState().mode !== 'live') return;
    const snapshot = await api.workspace(); enterLive(snapshot.data, snapshot.revision, snapshot.serverTime);
  },
  completeLogin: async (user, tenantId) => {
    setCsrfToken(readCsrfCookie());
    const session = await api.session();
    if (!tenantId) { set({ status: 'authenticated', user, tenantId: null, workspaces: session.workspaces }); return; }
    const snapshot = await api.workspace(); enterLive(snapshot.data, snapshot.revision, snapshot.serverTime);
    set({ status: 'authenticated', user: session.user ?? user, tenantId: session.tenantId ?? tenantId, workspaces: session.workspaces, error: null });
  },
  switchWorkspace: async tenantId => {
    await api.switchWorkspace(tenantId); const snapshot = await api.workspace(); enterLive(snapshot.data, snapshot.revision, snapshot.serverTime);
    set({ tenantId, user: get().user });
  },
  signOut: async () => { try { await api.logout(); } finally { setCsrfToken(null); clearClientData(); set({ status: 'anonymous', user: null, tenantId: null, workspaces: [], error: null }); } },
}));

export interface SessionInfo { user: User; tenant: Tenant; role: RoleId; ctx: AccessContext; can: (p: Permission) => boolean; tenants: Tenant[]; switchTenant: (id: ID) => void }
export function useSessionInfo(): SessionInfo | null {
  const data = useData(s => s.data); const mode = useData(s => s.mode);
  const demoUserId = useSession(s => s.userId); const demoTenantId = useSession(s => s.tenantId); const demoSwitch = useSession(s => s.switchTenant);
  const live = useLiveAuth();
  return useMemo(() => {
    if (mode === 'live') {
      if (live.status !== 'authenticated' || !live.user || !live.tenantId) return null;
      const tenant = data.tenants.find(t => t.id === live.tenantId); if (!tenant) return null;
      const ctx = accessContextFor(data.memberships, live.user.id, live.tenantId, tenant.providerId, data.delegations); if (!ctx) return null;
      const tenants: Tenant[] = live.workspaces.map(w => data.tenants.find(t => t.id === w.id) ?? { id: w.id, name: w.name, type: w.type as Tenant['type'], slug: w.id, city: '', industry: '', plan: 'starter', status: 'active', createdAt: '', aiAssistCredits: 0 });
      return { user: live.user, tenant, role: ctx.role, ctx, can: p => can(ctx, p), tenants, switchTenant: id => { void live.switchWorkspace(id); } };
    }
    if (mode !== 'demo' || !demoUserId || !demoTenantId) return null;
    const user = userById(data, demoUserId); const tenant = data.tenants.find(t => t.id === demoTenantId); if (!user || !tenant) return null;
    const ctx = accessContextFor(data.memberships, demoUserId, demoTenantId, tenant.providerId, data.delegations); if (!ctx) return null;
    const allowed = accessibleTenantIds(data, demoUserId);
    return { user, tenant, role: ctx.role, ctx, can: p => can(ctx, p), tenants: allowed.map(id => data.tenants.find(t => t.id === id)!).filter(Boolean), switchTenant: demoSwitch };
  }, [data, mode, demoUserId, demoTenantId, demoSwitch, live.status, live.user, live.tenantId, live.workspaces, live.switchWorkspace]);
}

export function useAppMode(): 'demo' | 'live' | 'unconfigured' { return useData(s => s.mode); }
export function useSignOut(): () => void {
  const mode = useData(s => s.mode); const demoSignOut = useSession(s => s.signOut); const liveSignOut = useLiveAuth(s => s.signOut);
  return () => { if (mode === 'live') void liveSignOut(); else { demoSignOut(); enterDemo(); } };
}
export function useBootstrap() {
  const bootstrap = useLiveAuth(s => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
}
export function useEnterDemo() { return () => { enterDemo(); }; }

type Theme = 'light' | 'dark';
interface UiPrefsState { prefs: { theme: Theme; sidebarCollapsed: boolean }; setPrefs: (patch: Partial<UiPrefsState['prefs']>) => void }
export const useUiPrefs = create<UiPrefsState>()(zustandPersist(set => ({ prefs: { theme: 'light', sidebarCollapsed: false }, setPrefs: patch => set(s => ({ prefs: { ...s.prefs, ...patch } })) }), { name: 'techpros.prefs' }));
export function useApplyTheme() { const theme = useUiPrefs(s => s.prefs.theme); useEffect(() => { const root = document.documentElement; if (theme === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme'); }, [theme]); }
const Ctx = createContext<SessionInfo | null>(null);
export function SessionProvider({ value, children }: { value: SessionInfo | null; children: ReactNode }) { return <Ctx.Provider value={value}>{children}</Ctx.Provider>; }
export function useSessionCtx(): SessionInfo { const v = useContext(Ctx); if (!v) throw new Error('Session required'); return v; }

/** Keeps live snapshots fresh without persisting business data to the browser. */
export function useLivePolling(intervalMs = 30000) {
  const mode = useData(s => s.mode); const status = useLiveAuth(s => s.status);
  useEffect(() => {
    if (mode !== 'live' || status !== 'authenticated') return;
    let active = true;
    const refresh = async () => { if (!active || document.visibilityState === 'hidden') return; try { await useLiveAuth.getState().refresh(); } catch { /* surfaced on next explicit action */ } };
    const timer = window.setInterval(() => void refresh(), intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [mode, status, intervalMs]);
}

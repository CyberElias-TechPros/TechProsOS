/**
 * Session — who is signed in and which workspace is active.
 * Demo build: identities are fictional and sign-in is local. The permission
 * contracts that guard every operation live in db.ts and are unchanged by this.
 */
import { create } from 'zustand';
import { persist as zustandPersist } from 'zustand/middleware';
import { useEffect } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ID, RoleId, Tenant, User } from './types';
import { accessContextFor, can, type AccessContext, type Permission } from './permissions';
import { accessibleTenantIds, userById } from './db';
import { useData } from './store';

interface SessionState {
  userId: ID | null;
  tenantId: ID | null;
  signIn: (userId: ID, tenantId: ID) => void;
  switchTenant: (tenantId: ID) => void;
  signOut: () => void;
  setWorkspace: (userId: ID, tenantId: ID) => void;
}

export const useSession = create<SessionState>()(
  zustandPersist(
    set => ({
      userId: null,
      tenantId: null,
      signIn: (userId, tenantId) => set({ userId, tenantId }),
      switchTenant: tenantId => set({ tenantId }),
      signOut: () => set({ userId: null, tenantId: null }),
      setWorkspace: (userId, tenantId) => set({ userId, tenantId }),
    }),
    { name: 'techpros.session' },
  ),
);

export interface SessionInfo {
  user: User;
  tenant: Tenant;
  role: RoleId;
  ctx: AccessContext;
  can: (p: Permission) => boolean;
  tenants: Tenant[];       // workspaces the user may enter
  switchTenant: (id: ID) => void;
}

/** Resolved session for the signed-in user within the active workspace. */
export function useSessionInfo(): SessionInfo | null {
  const data = useData(s => s.data);
  const userId = useSession(s => s.userId);
  const tenantId = useSession(s => s.tenantId);
  const switchTenant = useSession(s => s.switchTenant);
  return useMemo(() => {
    if (!userId || !tenantId) return null;
    const user = userById(data, userId);
    const tenant = data.tenants.find(t => t.id === tenantId);
    if (!user || !tenant) return null;
    const ctx = accessContextFor(data.memberships, userId, tenantId, tenant.providerId);
    if (!ctx) return null;
    const allowed = accessibleTenantIds(data, userId);
    return {
      user, tenant, role: ctx.role, ctx,
      can: (p: Permission) => can(ctx, p),
      tenants: allowed.map(id => data.tenants.find(t => t.id === id)!).filter(Boolean),
      switchTenant,
    };
  }, [data, userId, tenantId, switchTenant]);
}

/* ── Interface preferences (theme, sidebar) — cosmetic only, persisted ───── */
type Theme = 'light' | 'dark';
interface UiPrefsState {
  prefs: { theme: Theme; sidebarCollapsed: boolean };
  setPrefs: (patch: Partial<UiPrefsState['prefs']>) => void;
}

export const useUiPrefs = create<UiPrefsState>()(
  zustandPersist(
    set => ({
      prefs: { theme: 'light', sidebarCollapsed: false },
      setPrefs: patch => set(s => ({ prefs: { ...s.prefs, ...patch } })),
    }),
    { name: 'techpros.prefs' },
  ),
);

/** Applies the persisted theme to <html data-theme="…">. Mount once at root. */
export function useApplyTheme() {
  const theme = useUiPrefs(s => s.prefs.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }, [theme]);
}

// React context alias for ergonomic consumption in deeply nested UI.
const Ctx = createContext<SessionInfo | null>(null);
export function SessionProvider({ value, children }: { value: SessionInfo | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSessionCtx(): SessionInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error('Session required');
  return v;
}

/** Browser client for the live server. No secrets, no localStorage business data. */
import type { DataSet } from './types';
export interface PublicConfig { mode: 'demo' | 'live'; setupRequired: string[]; features: { email: boolean; billing: boolean; monitoring: boolean }; version: string }
export interface WorkspaceSnapshot { data: DataSet; revision: number; serverTime: string }
export class ApiError extends Error { constructor(message: string, public code: string, public status: number, public requestId?: string) { super(message); this.name = 'ApiError'; } }
let csrfToken: string | null = null;
export function setCsrfToken(value: string | null) { csrfToken = value; }
export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('tp_csrf='));
  return match ? decodeURIComponent(match.slice('tp_csrf='.length)) : null;
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) { const csrf = csrfToken ?? readCsrfCookie(); if (csrf) headers.set('X-CSRF-Token', csrf); }
  let response: Response;
  try { response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch { throw new ApiError('Network unavailable. Check your connection and retry; your changes were not confirmed.', 'NETWORK_ERROR', 0); }
  const text = await response.text(); let body: any = {}; try { body = text ? JSON.parse(text) : {}; } catch { throw new ApiError('The server returned an invalid response', 'INVALID_RESPONSE', response.status); }
  if (!response.ok) throw new ApiError(body.error?.message ?? 'Request failed', body.error?.code ?? 'REQUEST_FAILED', response.status, body.requestId);
  return body as T;
}
export const api = {
  config: () => request<PublicConfig>('/api/config'),
  session: () => request<{ user: import('./types').User; tenantId: string | null; workspaces: { id: string; name: string; type: string; role: string; delegated: boolean }[] }>('/api/auth/session'),
  login: (email: string, password: string) => request<{ user?: import('./types').User; tenantId?: string | null; mfaRequired?: boolean; challenge?: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  mfa: (challenge: string, code: string) => request<{ user: import('./types').User; tenantId: string | null }>('/api/auth/mfa', { method: 'POST', body: JSON.stringify({ challenge, code }) }),
  register: (input: unknown) => request<{ message: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  verifyEmail: (token: string) => request<{ user: import('./types').User; tenantId: string | null }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: (email: string) => request<{ message: string }>('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) => request<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input: { token: string; password: string; code?: string }) => request<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }),
  invitation: (token: string) => request<{ name: string; email: string; role: string; tenant_name: string }>(`/api/auth/invitation?token=${encodeURIComponent(token)}`),
  acceptInvitation: (input: { token: string; name: string; password?: string }) => request<{ user: import('./types').User; tenantId: string | null }>('/api/auth/accept-invitation', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  switchWorkspace: (tenantId: string) => request<{ tenantId: string }>('/api/auth/switch', { method: 'POST', body: JSON.stringify({ tenantId }) }),
  workspace: () => request<WorkspaceSnapshot>('/api/workspace'),
  command: (revision: number, command: unknown) => request<{ result: { id?: string; count?: number; deduped?: boolean; incidentId?: string; deviceToken?: string }; snapshot: WorkspaceSnapshot }>('/api/commands', { method: 'POST', body: JSON.stringify({ revision, command }) }),
  billingCheckout: (plan: string) => request<{ url: string; reference: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  invoiceCheckout: (id: string) => request<{ url: string; reference: string }>('/api/invoices/checkout', { method: 'POST', body: JSON.stringify({ id }) }),
  verifyBilling: (reference: string) => request<{ status: string }>(`/api/billing/verify?reference=${encodeURIComponent(reference)}`),
  uploadAttachment: (input: { entityId: string; name: string; mime: string; contentBase64: string }) => request<{ id: string }>('/api/attachments', { method: 'POST', body: JSON.stringify(input) }),
  accountProfile: (input: { name: string; phone: string; title: string }) => request<{ ok: boolean }>('/api/account/profile', { method: 'POST', body: JSON.stringify(input) }),
  changePassword: (input: { currentPassword: string; password: string; code?: string }) => request<{ ok: boolean }>('/api/account/password', { method: 'POST', body: JSON.stringify(input) }),
  mfaSetup: (password: string) => request<{ secret: string; uri: string }>('/api/account/mfa/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  mfaEnable: (code: string) => request<{ recoveryCodes: string[] }>('/api/account/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  mfaDisable: (code: string) => request<{ ok: boolean }>('/api/account/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
  sessions: () => request<{ sessions: { id: string; created_at: string; expires_at: string; current: boolean }[] }>('/api/account/sessions'),
  revokeSessions: (input: { id?: string; all?: boolean }) => request<{ ok: boolean }>('/api/account/sessions/revoke', { method: 'POST', body: JSON.stringify(input) }),
  exportWorkspaceUrl: '/api/export/workspace',
  exportAccountUrl: '/api/account/export',
};

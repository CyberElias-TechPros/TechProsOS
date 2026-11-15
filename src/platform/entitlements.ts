/**
 * Plan entitlements — the commercial boundary, enforced in the domain layer.
 *
 * Seats, client workspaces and assistant credits were previously display-only: `PLANS[x].seats`
 * was read to render a label and to block a downgrade, but nothing stopped a 10-seat workspace
 * from inviting its eleventh user. Enforcement belongs here, beside the permission checks, so
 * no UI path (and no direct API call) can bypass it.
 *
 * Counting rules are deliberately explicit:
 * - A **pending, unexpired invitation reserves a seat**. Otherwise a full workspace could send
 *   unlimited invitations that all become active later, silently oversubscribing the plan.
 * - Suspended members and revoked/expired invitations release their seat.
 * - Only **active** client workspaces count, so suspending a client frees an allowance slot.
 */
import type { DataSet, ID } from './types';
import { PLANS } from './plans';

export interface Usage { used: number; limit: number; remaining: number; exhausted: boolean }
const usage = (used: number, limit: number): Usage => ({
  used, limit, remaining: limit === Infinity ? Infinity : Math.max(0, limit - used), exhausted: limit !== Infinity && used >= limit,
});

export interface SeatUsage extends Usage { members: number; pending: number }

/** Active members plus seat-reserving pending invitations. */
export function seatUsage(d: DataSet, tenantId: ID, nowMs = Date.now()): SeatUsage {
  const members = d.memberships.filter(m => m.tenantId === tenantId && m.status === 'active').length;
  const pending = d.invitations.filter(i => i.tenantId === tenantId && i.status === 'pending' && Date.parse(i.expiresAt) > nowMs).length;
  const plan = d.tenants.find(t => t.id === tenantId)?.plan ?? 'starter';
  return { ...usage(members + pending, PLANS[plan].seats), members, pending };
}

/** Active client workspaces owned by this provider. */
export function clientUsage(d: DataSet, tenantId: ID): Usage {
  const used = d.tenants.filter(t => t.providerId === tenantId && t.status === 'active').length;
  const plan = d.tenants.find(t => t.id === tenantId)?.plan ?? 'starter';
  return usage(used, PLANS[plan].clientWorkspaces);
}

export interface CreditUsage { remaining: number; exhausted: boolean }
export function creditUsage(d: DataSet, tenantId: ID): CreditUsage {
  const remaining = Math.max(0, d.tenants.find(t => t.id === tenantId)?.aiAssistCredits ?? 0);
  return { remaining, exhausted: remaining <= 0 };
}

export function entitlementsFor(d: DataSet, tenantId: ID, nowMs = Date.now()) {
  return { seats: seatUsage(d, tenantId, nowMs), clients: clientUsage(d, tenantId), credits: creditUsage(d, tenantId) };
}

/** Human-readable refusal, phrased so the UI can point at the upgrade path. */
export function seatLimitMessage(u: SeatUsage): string {
  return `Your plan includes ${u.limit} seats and all are in use (${u.members} active, ${u.pending} invited). Revoke a pending invitation, deactivate a member, or upgrade the plan to add more.`;
}
export function clientLimitMessage(u: Usage): string {
  return u.limit === 0
    ? 'Client workspaces require a service-provider plan. Switch to a provider workspace or upgrade to an MSP plan.'
    : `Your provider plan includes ${u.limit} active client workspaces and all are in use. Suspend a client or upgrade the plan to add more.`;
}

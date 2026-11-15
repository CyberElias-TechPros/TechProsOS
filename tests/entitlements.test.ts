// @vitest-environment node
/**
 * Plan entitlements are a revenue boundary, not a display detail. Before this work PLANS[x].seats
 * was only ever read to render a label and to block a *downgrade* — inviting users and onboarding
 * clients were unlimited on every plan. These tests pin the enforcement at the domain layer,
 * where the permission checks already live, so the UI cannot bypass it.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyData, provisionWorkspace, DomainError } from '../src/platform/operations';
import { accessContextFor } from '../src/platform/permissions';
import { seatUsage, clientUsage, creditUsage, entitlementsFor } from '../src/platform/entitlements';
import { PLANS } from '../src/platform/plans';
import type { DataSet } from '../src/platform/types';
import type { RegisterInput } from '../src/platform/contracts';

const NOW = new Date('2026-06-01T09:00:00.000Z');

function workspace(plan: 'starter' | 'msp_launch' = 'starter'): { d: DataSet; tenantId: string; ownerId: string } {
  const d = emptyData();
  const tenantId = crypto.randomUUID(); const ownerId = crypto.randomUUID();
  const input: RegisterInput = {
    orgName: 'Entitlement Test Ltd', industry: 'IT services', city: 'Lagos', plan,
    type: plan === 'msp_launch' ? 'service_provider' : 'organisation',
    ownerName: 'Ada Owner', ownerEmail: 'ada@example.test', ownerPhone: '08010000000',
    branches: [{ name: 'HQ', city: 'Lagos' }], departments: ['ICT'], consent: true,
  } as RegisterInput;
  provisionWorkspace(d, input, { tenantId, userId: ownerId, branchIds: [crypto.randomUUID()], departmentIds: [crypto.randomUUID()], policyId: crypto.randomUUID() }, NOW.toISOString());
  d.users.push({ id: ownerId, name: 'Ada Owner', email: 'ada@example.test', phone: '', title: '', status: 'active', emailVerified: true, createdAt: NOW.toISOString() });
  return { d, tenantId, ownerId };
}
const ctxOf = (d: DataSet, ownerId: string, tenantId: string) => accessContextFor(d.memberships, ownerId, tenantId, undefined, [])!;

/** Fill active memberships up to (but not exceeding) the plan's seat count. */
function fillSeats(d: DataSet, tenantId: string, count: number) {
  while (d.memberships.filter(m => m.tenantId === tenantId && m.status === 'active').length < count) {
    const userId = crypto.randomUUID();
    d.users.push({ id: userId, name: `Staff ${userId.slice(0, 4)}`, email: `${userId}@example.test`, phone: '', title: '', status: 'active', emailVerified: true, createdAt: NOW.toISOString() });
    d.memberships.push({ userId, tenantId, role: 'employee', status: 'active' });
  }
}

describe('seat entitlements', () => {
  it('counts active memberships and pending invitations against the plan', () => {
    const { d, tenantId, ownerId } = workspace();
    fillSeats(d, tenantId, 4);
    applyCommand(d, ctxOf(d, ownerId, tenantId), { type: 'user.invite', name: 'Pending Person', email: 'pending@example.test', role: 'employee' }, { now: NOW });
    const usage = seatUsage(d, tenantId, NOW.getTime());
    expect(usage.members).toBe(4);
    expect(usage.pending).toBe(1);
    // A pending invitation reserves a seat, otherwise invites could oversubscribe the plan.
    expect(usage.used).toBe(5);
    expect(usage.limit).toBe(PLANS.starter.seats);
  });

  it('does not count suspended members or revoked/expired invitations', () => {
    const { d, tenantId, ownerId } = workspace();
    fillSeats(d, tenantId, 3);
    const ctx = ctxOf(d, ownerId, tenantId);
    const suspended = d.memberships.find(m => m.tenantId === tenantId && m.userId !== ownerId)!;
    suspended.status = 'suspended';
    d.invitations.push(
      { id: crypto.randomUUID(), tenantId, name: 'Revoked', email: 'r@example.test', role: 'employee', status: 'revoked', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 86400000).toISOString() },
      { id: crypto.randomUUID(), tenantId, name: 'Expired', email: 'e@example.test', role: 'employee', status: 'pending', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() - 1000).toISOString() },
    );
    expect(seatUsage(d, tenantId, NOW.getTime()).used).toBe(2);
    void ctx;
  });

  it('refuses an invitation that would exceed the plan seat limit', () => {
    const { d, tenantId, ownerId } = workspace();
    fillSeats(d, tenantId, PLANS.starter.seats);
    expect(() => applyCommand(d, ctxOf(d, ownerId, tenantId),
      { type: 'user.invite', name: 'One Too Many', email: 'extra@example.test', role: 'employee' }, { now: NOW }))
      .toThrow(/seat/i);
  });

  it('reports the limit with a dedicated code so the UI can offer an upgrade', () => {
    const { d, tenantId, ownerId } = workspace();
    fillSeats(d, tenantId, PLANS.starter.seats);
    try {
      applyCommand(d, ctxOf(d, ownerId, tenantId), { type: 'user.invite', name: 'X', email: 'x@example.test', role: 'employee' }, { now: NOW });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('SEAT_LIMIT');
      expect((error as DomainError).status).toBe(409);
    }
  });

  it('allows inviting right up to the limit', () => {
    const { d, tenantId, ownerId } = workspace();
    fillSeats(d, tenantId, PLANS.starter.seats - 1);
    expect(() => applyCommand(d, ctxOf(d, ownerId, tenantId),
      { type: 'user.invite', name: 'Fits', email: 'fits@example.test', role: 'employee' }, { now: NOW })).not.toThrow();
    expect(seatUsage(d, tenantId, NOW.getTime()).used).toBe(PLANS.starter.seats);
  });

  it('treats enterprise seats as unlimited', () => {
    const { d, tenantId, ownerId } = workspace();
    d.tenants.find(t => t.id === tenantId)!.plan = 'enterprise';
    fillSeats(d, tenantId, 300);
    expect(entitlementsFor(d, tenantId, NOW.getTime()).seats.limit).toBe(Infinity);
    expect(() => applyCommand(d, ctxOf(d, ownerId, tenantId),
      { type: 'user.invite', name: 'More', email: 'more@example.test', role: 'employee' }, { now: NOW })).not.toThrow();
  });
});

describe('client workspace entitlements', () => {
  it('refuses onboarding beyond the provider plan allowance', () => {
    const { d, tenantId, ownerId } = workspace('msp_launch');
    const ctx = ctxOf(d, ownerId, tenantId);
    const limit = PLANS.msp_launch.clientWorkspaces;
    for (let i = 0; i < limit; i++) {
      applyCommand(d, ctx, { type: 'client.onboard', name: `Client ${i}`, industry: 'Education', city: 'Lagos', contactName: 'Contact', contactEmail: `c${i}@example.test`, tier: 'Managed', monthlyFee: 50000 }, { now: NOW });
    }
    expect(clientUsage(d, tenantId).used).toBe(limit);
    try {
      applyCommand(d, ctx, { type: 'client.onboard', name: 'One Too Many', industry: 'Education', city: 'Abuja', contactName: 'C', contactEmail: 'over@example.test', tier: 'Managed', monthlyFee: 50000 }, { now: NOW });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('CLIENT_LIMIT');
    }
  });

  it('does not count suspended client workspaces', () => {
    const { d, tenantId, ownerId } = workspace('msp_launch');
    const ctx = ctxOf(d, ownerId, tenantId);
    const limit = PLANS.msp_launch.clientWorkspaces;
    for (let i = 0; i < limit; i++) applyCommand(d, ctx, { type: 'client.onboard', name: `Client ${i}`, industry: 'Education', city: 'Lagos', contactName: 'C', contactEmail: `c${i}@example.test`, tier: 'Managed', monthlyFee: 1000 }, { now: NOW });
    d.tenants.find(t => t.providerId === tenantId)!.status = 'suspended';
    expect(clientUsage(d, tenantId).used).toBe(limit - 1);
    expect(() => applyCommand(d, ctx, { type: 'client.onboard', name: 'Replacement', industry: 'Health', city: 'Kano', contactName: 'C', contactEmail: 'new@example.test', tier: 'Managed', monthlyFee: 1000 }, { now: NOW })).not.toThrow();
  });

  it('an organisation plan has no client allowance', () => {
    const { d, tenantId } = workspace('starter');
    expect(entitlementsFor(d, tenantId, NOW.getTime()).clients.limit).toBe(0);
  });
});

describe('assistant credits', () => {
  it('reports remaining credits and blocks use at zero', () => {
    const { d, tenantId } = workspace();
    expect(creditUsage(d, tenantId).remaining).toBe(500);
    d.tenants.find(t => t.id === tenantId)!.aiAssistCredits = 0;
    const usage = creditUsage(d, tenantId);
    expect(usage.remaining).toBe(0);
    expect(usage.exhausted).toBe(true);
  });

  it('consumes exactly one credit per assistant turn and audits it', () => {
    const { d, tenantId, ownerId } = workspace();
    const ctx = ctxOf(d, ownerId, tenantId);
    const before = d.tenants.find(t => t.id === tenantId)!.aiAssistCredits;
    applyCommand(d, ctx, { type: 'assistant.consume' }, { now: NOW });
    expect(d.tenants.find(t => t.id === tenantId)!.aiAssistCredits).toBe(before - 1);
    expect(d.auditLogs.some(a => a.action === 'assistant.consume')).toBe(true);
  });

  it('refuses to go negative', () => {
    const { d, tenantId, ownerId } = workspace();
    d.tenants.find(t => t.id === tenantId)!.aiAssistCredits = 0;
    try {
      applyCommand(d, ctxOf(d, ownerId, tenantId), { type: 'assistant.consume' }, { now: NOW });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as DomainError).code).toBe('CREDIT_LIMIT');
    }
    expect(d.tenants.find(t => t.id === tenantId)!.aiAssistCredits).toBe(0);
  });
});

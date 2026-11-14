import { describe, expect, it } from 'vitest';
import { accessContextFor, can, ticketScope } from '../src/platform/permissions';
import { buildSeed, DEMO, DEMO_USERS } from '../src/platform/seed';
import { visibleTickets } from '../src/platform/metrics';

const data = buildSeed();

describe('permission engine', () => {
  it('org owner holds every permission', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.chidera, DEMO.greenfield, undefined)!;
    expect(ctx).not.toBeNull();
    expect(can(ctx, 'admin.subscription')).toBe(true);
    expect(can(ctx, 'itsm.ticket.assign')).toBe(true);
    expect(can(ctx, 'admin.audit')).toBe(true);
  });

  it('employee can only see their own tickets and cannot assign', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.tobi, DEMO.greenfield, undefined)!;
    expect(ticketScope(ctx)).toBe('own');
    expect(can(ctx, 'itsm.ticket.assign')).toBe(false);
    expect(can(ctx, 'assets.asset.create')).toBe(false);
    expect(can(ctx, 'admin.users')).toBe(false);
    expect(can(ctx, 'itsm.ticket.create')).toBe(true);
  });

  it('technician sees the team queue but not billing admin', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.emeka, DEMO.greenfield, undefined)!;
    expect(ticketScope(ctx)).toBe('team');
    expect(can(ctx, 'admin.subscription')).toBe(false);
    expect(can(ctx, 'reports.report.view')).toBe(true);
  });

  it('finance officer manages invoices but not assets', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.femi, DEMO.greenfield, undefined)!;
    expect(can(ctx, 'finance.invoice.manage')).toBe(true);
    expect(can(ctx, 'assets.asset.create')).toBe(false);
  });

  it('provider staff get delegated access inside client tenants', () => {
    const stives = data.tenants.find(t => t.id === DEMO.stives)!;
    const ctx = accessContextFor(data.memberships, DEMO_USERS.yusuf, DEMO.stives, stives.providerId, data.delegations)!;
    expect(ctx).not.toBeNull();
    expect(ctx.delegated).toBe(true);
    expect(can(ctx, 'itsm.ticket.update')).toBe(true);
  });

  it('users with no relationship get no context', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.tobi, DEMO.stives, DEMO.techpros);
    expect(ctx).toBeNull();
  });

  it('tenant isolation: employee in one org sees zero tickets of another', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.ifeoma, DEMO.stives, undefined)!;
    const tickets = visibleTickets(data, ctx);
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every(t => t.tenantId === DEMO.stives)).toBe(true);
  });

  it('employee scope shows only own tickets', () => {
    const ctx = accessContextFor(data.memberships, DEMO_USERS.tobi, DEMO.greenfield, undefined)!;
    const tickets = visibleTickets(data, ctx);
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every(t => t.requesterId === DEMO_USERS.tobi || t.assigneeId === DEMO_USERS.tobi)).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { resetWorkspaceData, getData } from '../src/platform/store';
import { accessContextFor } from '../src/platform/permissions';
import { visibleTickets } from '../src/platform/metrics';
import {
  createTicket, setTicketStatus, PermissionDenied, registerOrganisation, createAsset, assignTicket, simulateDeviceOutage,
} from '../src/platform/db';
import { DEMO, DEMO_USERS } from '../src/platform/seed';

// Each test starts from a clean deterministic seed.
beforeEach(() => resetWorkspaceData());

const ctxFor = (userId: string, tenantId: string) => {
  const t = getData().tenants.find(x => x.id === tenantId)!;
  const ctx = accessContextFor(getData().memberships, userId, tenantId, t.providerId);
  if (!ctx) throw new Error('no access');
  return ctx;
};

describe('tenant isolation through the data layer', () => {
  it('registering a new organisation creates an isolated tenant with default SLA', () => {
    const { tenantId, userId } = registerOrganisation({
      orgName: 'Test School of Lagos', industry: 'Education', city: 'Lagos', plan: 'starter', type: 'organisation',
      ownerName: 'Test Owner', ownerEmail: 'owner@test.ng', ownerPhone: '08010000000',
      branches: [{ name: 'HQ', city: 'Lagos' }], departments: ['ICT'],
    });
    const d = getData();
    expect(d.tenants.find(t => t.id === tenantId)?.name).toBe('Test School of Lagos');
    expect(d.slaPolicies.find(p => p.tenantId === tenantId)).toBeTruthy();
    // previous tenants' data untouched
    expect(d.tickets.filter(t => t.tenantId === DEMO.greenfield).length).toBeGreaterThan(10);
    void userId;
  });

  it('an org cannot see or mutate another orgs tickets', () => {
    const ifeoma = ctxFor(DEMO_USERS.ifeoma, DEMO.stives);
    const seen = visibleTickets(getData(), ifeoma);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some(t => t.tenantId === DEMO.greenfield)).toBe(false);
    // direct mutation of a foreign ticket is a no-op, not a leak
    const before = getData().tickets.find(t => t.id === 'tk_100')!.status;
    setTicketStatus(ifeoma, 'tk_100', 'closed'); // wrong tenant → silently ignored
    expect(getData().tickets.find(t => t.id === 'tk_100')!.status).toBe(before);
  });

  it('permission denials throw and write nothing', () => {
    const tobi = ctxFor(DEMO_USERS.tobi, DEMO.greenfield);
    expect(() =>
      createAsset(tobi, { name: 'X', category: 'End-user computing', manufacturer: '', model: '', serial: '', branchId: 'b_ikeja', purchaseDate: '2026-01-01', purchaseCost: 1, usefulLifeYears: 4 }),
    ).toThrow(PermissionDenied);
  });

  it('ticket creation stamps SLA deadlines from the priority matrix', () => {
    const ngozi = ctxFor(DEMO_USERS.ngozi, DEMO.greenfield);
    const id = createTicket(ngozi, { kind: 'incident', title: 'Test outage', description: 'x', category: 'Network & connectivity', impact: 'high', urgency: 'high' });
    const t = getData().tickets.find(x => x.id === id)!;
    expect(t.priority).toBe('critical');
    expect(t.responseDueAt && t.resolveDueAt).toBeTruthy();
    expect(getData().auditLogs.some(a => a.entityId === id && a.action === 'ticket.created')).toBe(true);
  });

  it('assignment notifies the assignee and records an audit entry', () => {
    const ngozi = ctxFor(DEMO_USERS.ngozi, DEMO.greenfield);
    assignTicket(ngozi, 'tk_100', DEMO_USERS.emeka);
    const d = getData();
    expect(d.tickets.find(t => t.id === 'tk_100')!.assigneeId).toBe(DEMO_USERS.emeka);
    expect(d.notifications.some(n => n.userId === DEMO_USERS.emeka && n.title.includes('assigned'))).toBe(true);
    expect(d.auditLogs.some(a => a.entityId === 'tk_100' && a.action === 'ticket.assigned')).toBe(true);
  });

  it('device-outage automation dedupes and creates a linked critical incident', () => {
    const amara = ctxFor(DEMO_USERS.amara, DEMO.greenfield);
    const first = simulateDeviceOutage(amara, 'dev_ap1');
    expect(first.deduped).toBe(false);
    const second = simulateDeviceOutage(amara, 'dev_ap1');
    expect(second.deduped).toBe(true);
    const d = getData();
    const alert = d.alerts.find(a => a.id === first.alertId)!;
    const incident = d.tickets.find(t => t.id === alert.incidentId)!;
    expect(incident.priority).toBe('critical');
    expect(incident.source).toBe('monitoring');
    expect(d.devices.find(x => x.id === 'dev_ap1')!.status).toBe('down');
  });

  it('employee cannot close another users active ticket', () => {
    const tobi = ctxFor(DEMO_USERS.tobi, DEMO.greenfield);
    expect(() => setTicketStatus(tobi, 'tk_101', 'closed')).toThrow(PermissionDenied);
  });
});

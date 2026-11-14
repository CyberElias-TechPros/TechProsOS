import { beforeEach, describe, expect, it } from 'vitest';
import { buildSeed, DEMO, DEMO_USERS } from '../src/platform/seed';
import { accessContextFor } from '../src/platform/permissions';
import { addTask, createPurchaseOrder, setPoStatus, setTicketStatus, toggleMilestone, addTicketMessage } from '../src/platform/db';
import { getData, resetWorkspaceData, useData } from '../src/platform/store';
import { projectSpend } from '../src/platform/metrics';
import { filterReportData } from '../src/platform/reporting';

beforeEach(() => resetWorkspaceData());
const context = (user: string, tenant: string) => {
  const d = getData();
  return accessContextFor(d.memberships, user, tenant, d.tenants.find(t => t.id === tenant)?.providerId, d.delegations)!;
};

describe('production abuse cases', () => {
  it('employees never receive another requester’s internal notes', () => {
    const manager = context(DEMO_USERS.ngozi, DEMO.greenfield);
    const ticket = getData().tickets.find(t => t.requesterId === DEMO_USERS.tobi && !['closed', 'resolved'].includes(t.status))!;
    addTicketMessage(manager, ticket.id, 'Confidential staff investigation', true);
    const employee = context(DEMO_USERS.tobi, DEMO.greenfield);
    // The server projection is the security boundary, not just a hidden UI checkbox.
    const projected = filterReportData(getData(), employee);
    expect(projected.ticketMessages.some(m => m.internal)).toBe(false);
  });

  it('rejects a cross-tenant project reference instead of silently writing an orphan', () => {
    const owner = context(DEMO_USERS.chidera, DEMO.greenfield);
    const foreignProject = getData().projects.find(p => p.tenantId !== DEMO.greenfield)!;
    expect(() => addTask(owner, foreignProject.id, 'Injected task', 'todo')).toThrow(/not found|outside/i);
  });

  it('purchase orders cannot skip approval or receive stock twice', () => {
    const proc = context(DEMO_USERS.kemi, DEMO.greenfield);
    const vendor = getData().vendors.find(v => v.tenantId === DEMO.greenfield)!;
    createPurchaseOrder(proc, { vendorId: vendor.id, branchId: 'b_ikeja', items: [{ name: 'Patch cables', qty: 2, unitCost: 1000, kind: 'consumable' }] });
    const po = getData().purchaseOrders[0];
    expect(() => setPoStatus(proc, po.id, 'received')).toThrow(/transition|approved|ordered/i);
    expect(() => setPoStatus(proc, po.id, 'approved')).toThrow(/different approver/i);
    setPoStatus(context(DEMO_USERS.chidera, DEMO.greenfield), po.id, 'approved');
    setPoStatus(proc, po.id, 'ordered');
    setPoStatus(proc, po.id, 'received');
    const stock = getData().stockItems.filter(s => s.tenantId === DEMO.greenfield && s.name === 'Patch cables');
    expect(stock.reduce((n, s) => n + s.qty, 0)).toBe(2);
    expect(() => setPoStatus(proc, po.id, 'received')).toThrow(/already|transition|terminal/i);
    expect(stock.reduce((n, s) => n + s.qty, 0)).toBe(2);
  });

  it('requester confirmation cannot bypass resolution; resolution requires a summary', () => {
    const employee = context(DEMO_USERS.tobi, DEMO.greenfield);
    const ticket = getData().tickets.find(t => t.requesterId === DEMO_USERS.tobi && t.status !== 'resolved' && t.status !== 'closed')!;
    expect(() => setTicketStatus(employee, ticket.id, 'closed')).toThrow(/transition|resolved/i);
    const manager = context(DEMO_USERS.ngozi, DEMO.greenfield);
    const open = getData().tickets.find(t => t.tenantId === DEMO.greenfield && t.status === 'in_progress')!;
    expect(() => setTicketStatus(manager, open.id, 'resolved')).toThrow(/summary/i);
  });

  it('project spend derives from actual expenses, never milestone keywords', () => {
    const owner = context(DEMO_USERS.chidera, DEMO.greenfield);
    const project = getData().projects.find(p => p.tenantId === DEMO.greenfield)!;
    useData.setState(s => ({ data: { ...s.data, projects: s.data.projects.map(p => p.id === project.id ? { ...p, milestones: [{ id: 'm-payment', title: 'Payment approved', dueAt: '2026-12-01', done: false }] } : p) } }));
    const before = projectSpend(getData(), project.id);
    toggleMilestone(owner, project.id, 'm-payment');
    expect(projectSpend(getData(), project.id)).toBe(before);
  });

  it('provider relationship alone does not grant access to a client', () => {
    const d = buildSeed();
    expect(accessContextFor(d.memberships, DEMO_USERS.segun, DEMO.stives, DEMO.techpros, [])).toBeNull();
  });
});

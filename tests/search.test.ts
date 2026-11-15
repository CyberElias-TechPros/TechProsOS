// @vitest-environment node
/**
 * Global search. The command palette only indexed tickets, assets and devices — and used
 * slice(-60) on a newest-first array, so it actually indexed the OLDEST 60 tickets while
 * claiming to be searchable. It also read data.tickets directly instead of the visibility
 * projection, so an employee could surface tickets outside their scope.
 *
 * Search must respect exactly the same scoping as the list screens: finding a record by name
 * is a read, and reads are permission-checked.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSearchIndex, searchRecords } from '../src/platform/search';
import { resetWorkspaceData, getData } from '../src/platform/store';
import { accessContextFor } from '../src/platform/permissions';
import { DEMO, DEMO_USERS } from '../src/platform/seed';
import { emptyData } from '../src/platform/operations';
import type { DataSet } from '../src/platform/types';

beforeEach(() => resetWorkspaceData());

const ctxFor = (d: DataSet, userId: string, tenantId: string) => {
  const t = d.tenants.find(x => x.id === tenantId);
  return accessContextFor(d.memberships, userId, tenantId, t?.providerId, d.delegations)!;
};

describe('search coverage', () => {
  it('finds records across every major module, not just tickets and assets', () => {
    const d = getData();
    // The owner holds every module permission, so this asserts coverage rather than scoping.
    const ctx = ctxFor(d, DEMO_USERS.chidera, DEMO.greenfield);
    const index = buildSearchIndex(d, ctx);
    const kinds = new Set(index.map(r => r.kind));
    for (const expected of ['Ticket', 'Asset', 'Project', 'Document', 'Article', 'Invoice']) {
      expect(kinds.has(expected), `expected ${expected} in the index`).toBe(true);
    }
  });

  it('omits modules the role has no permission for', () => {
    const d = getData();
    // it_manager genuinely lacks projects.project.view in the role matrix.
    const ctx = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    expect(buildSearchIndex(d, ctx).some(r => r.kind === 'Project')).toBe(false);
  });

  it('indexes the newest tickets, not the oldest', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    const scoped = d.tickets.filter(t => t.tenantId === DEMO.greenfield);
    const newest = scoped[0]; // tickets are stored newest-first
    const index = buildSearchIndex(d, ctx);
    expect(index.some(r => r.id === newest.id)).toBe(true);
  });

  it('matches on identifier as well as title', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    const ticket = d.tickets.find(t => t.tenantId === DEMO.greenfield)!;
    const hits = searchRecords(buildSearchIndex(d, ctx), ticket.number);
    expect(hits.some(h => h.id === ticket.id)).toBe(true);
  });

  it('returns everything relevant when the query is empty, capped', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    const index = buildSearchIndex(d, ctx);
    expect(searchRecords(index, '').length).toBeLessThanOrEqual(20);
    expect(searchRecords(index, '').length).toBeGreaterThan(0);
  });
});

describe('search respects permissions', () => {
  it('never returns another tenant\u2019s records', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    const index = buildSearchIndex(d, ctx);
    const foreignIds = new Set([
      ...d.tickets.filter(t => t.tenantId !== DEMO.greenfield).map(t => t.id),
      ...d.assets.filter(a => a.tenantId !== DEMO.greenfield).map(a => a.id),
    ]);
    expect(index.some(r => foreignIds.has(r.id))).toBe(false);
  });

  it('hides finance records from a role without invoice permission', () => {
    const d = getData();
    const technician = ctxFor(d, DEMO_USERS.emeka, DEMO.greenfield);
    const index = buildSearchIndex(d, technician);
    expect(index.some(r => r.kind === 'Invoice')).toBe(false);
  });

  it('shows finance records to a role that holds invoice permission', () => {
    const d = getData();
    // Give the owner an invoice so the assertion is about permission, not absence of data.
    d.invoices.unshift({
      id: 'inv-search-1', tenantId: DEMO.greenfield, number: 'INV-SEARCH-1', clientName: 'Searchable Client',
      status: 'sent', items: [{ desc: 'Support', qty: 1, unitPrice: 1000 }], vatRate: 0.075, whtRate: 0,
      issuedAt: new Date().toISOString(), dueAt: new Date().toISOString(), createdBy: DEMO_USERS.ngozi, payments: [],
    });
    const owner = ctxFor(d, DEMO_USERS.ngozi, DEMO.greenfield);
    const hits = searchRecords(buildSearchIndex(d, owner), 'INV-SEARCH-1');
    expect(hits.some(h => h.id === 'inv-search-1')).toBe(true);
  });

  it('restricts an employee to their own tickets', () => {
    const d = getData();
    const employeeId = DEMO_USERS.tobi;
    const ctx = ctxFor(d, employeeId, DEMO.greenfield);
    const index = buildSearchIndex(d, ctx);
    const indexedTickets = index.filter(r => r.kind === 'Ticket');
    const allowed = new Set(d.tickets.filter(t => t.tenantId === DEMO.greenfield && (t.requesterId === employeeId || t.assigneeId === employeeId)).map(t => t.id));
    expect(indexedTickets.every(t => allowed.has(t.id))).toBe(true);
  });

  it('returns nothing for a workspace with no data', () => {
    const empty = emptyData();
    empty.tenants.push({ id: 't-empty', name: 'Empty', slug: 'empty', type: 'organisation', industry: '', city: '', plan: 'starter', status: 'active', createdAt: new Date().toISOString(), aiAssistCredits: 0 });
    empty.memberships.push({ userId: 'u-empty', tenantId: 't-empty', role: 'org_owner', status: 'active' });
    const ctx = accessContextFor(empty.memberships, 'u-empty', 't-empty', undefined, [])!;
    expect(buildSearchIndex(empty, ctx)).toEqual([]);
  });
});

describe('search ranking', () => {
  const index = [
    { id: '1', kind: 'Ticket', title: 'Printer jam in Block B', subtitle: 'TKT-2001', to: '/x/1', icon: 'tickets' as const },
    { id: '2', kind: 'Asset', title: 'Block B printer', subtitle: 'AST-9', to: '/x/2', icon: 'assets' as const },
    { id: '3', kind: 'Ticket', title: 'Unrelated network issue', subtitle: 'TKT-2002', to: '/x/3', icon: 'tickets' as const },
  ];

  it('ranks a title that starts with the query above one that merely contains it', () => {
    const hits = searchRecords(index, 'printer');
    expect(hits[0].id).toBe('1'); // "Printer jam in Block B" starts with the query
    expect(hits.map(h => h.id)).toContain('2');
    expect(hits.map(h => h.id)).not.toContain('3');
  });

  it('ranks an identifier match highly so a pasted code lands first', () => {
    expect(searchRecords(index, 'TKT-2002')[0].id).toBe('3');
  });

  it('is case-insensitive and trims the query', () => {
    expect(searchRecords(index, '  PRINTER  ').length).toBe(2);
  });

  it('matches all terms regardless of order', () => {
    expect(searchRecords(index, 'block printer').length).toBe(2);
  });

  it('returns no hits for a query that matches nothing', () => {
    expect(searchRecords(index, 'zzzznothing')).toEqual([]);
  });

  it('caps results so the palette stays usable', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, kind: 'Ticket', title: `printer ${i}`, subtitle: '', to: `/x/${i}`, icon: 'tickets' as const }));
    expect(searchRecords(many, 'printer').length).toBeLessThanOrEqual(20);
  });
});

describe('palette integration', () => {
  it('exposes a document through the same index the palette uses', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.chidera, DEMO.greenfield);
    const doc = d.documents.find(x => x.tenantId === DEMO.greenfield)!;
    const distinctive = doc.title.split(' ').slice(0, 3).join(' ');
    const hits = searchRecords(buildSearchIndex(d, ctx), distinctive);
    const hit = hits.find(h => h.id === doc.id);
    expect(hit).toBeTruthy();
    expect(hit!.to).toMatch(/^\/app\//);
    expect(hit!.kind).toBe('Document');
  });

  it('every indexed record has a navigable workspace route and an icon', () => {
    const d = getData();
    const ctx = ctxFor(d, DEMO_USERS.chidera, DEMO.greenfield);
    for (const r of buildSearchIndex(d, ctx)) {
      expect(r.to.startsWith('/app/'), `${r.kind} ${r.id} has no workspace route`).toBe(true);
      expect(r.icon.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
});

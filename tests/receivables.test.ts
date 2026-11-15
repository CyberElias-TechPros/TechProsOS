// @vitest-environment node
/**
 * Receivables ageing. `InvoiceStatus` already included 'overdue' and `invoice.status` listed it
 * as a transition source, but nothing ever set it: an unpaid invoice stayed 'sent' forever, so
 * ageing reports were wrong and finance had no signal to chase payment.
 *
 * Ageing is derived, not a command a user issues — it must be a pure function of the invoice and
 * the clock so the scheduler, the UI and reports all agree.
 */
import { describe, expect, it } from 'vitest';
import { ageInvoices, invoiceAgeBucket, ageingSummary, type AgeBucket } from '../src/platform/receivables';
import type { Invoice } from '../src/platform/types';

const NOW = new Date('2026-06-30T12:00:00.000Z');
const day = 86400000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * day).toISOString();

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: crypto.randomUUID(), tenantId: 't1', number: 'INV-0001', clientName: 'Client Ltd',
    status: 'sent', items: [{ desc: 'Managed IT', qty: 1, unitPrice: 100000 }],
    vatRate: 0.075, whtRate: 0, issuedAt: iso(-40), dueAt: iso(-10),
    createdBy: 'u1', payments: [], ...over,
  };
}

describe('invoice age buckets', () => {
  it('treats an invoice due in the future as current', () => {
    expect(invoiceAgeBucket(invoice({ dueAt: iso(5) }), NOW.getTime())).toBe('current');
  });
  it('buckets overdue invoices by days past due', () => {
    expect(invoiceAgeBucket(invoice({ dueAt: iso(-1) }), NOW.getTime())).toBe('1-30');
    expect(invoiceAgeBucket(invoice({ dueAt: iso(-30) }), NOW.getTime())).toBe('1-30');
    expect(invoiceAgeBucket(invoice({ dueAt: iso(-31) }), NOW.getTime())).toBe('31-60');
    expect(invoiceAgeBucket(invoice({ dueAt: iso(-61) }), NOW.getTime())).toBe('61-90');
    expect(invoiceAgeBucket(invoice({ dueAt: iso(-91) }), NOW.getTime())).toBe('90+');
  });
  it('an invoice due exactly today is not yet overdue', () => {
    expect(invoiceAgeBucket(invoice({ dueAt: NOW.toISOString() }), NOW.getTime())).toBe('current');
  });
});

describe('ageInvoices', () => {
  it('marks a past-due unpaid sent invoice overdue', () => {
    const i = invoice();
    const changed = ageInvoices([i], NOW.getTime());
    expect(changed).toEqual([i.id]);
    expect(i.status).toBe('overdue');
  });

  it('marks a partially paid past-due invoice overdue without losing its payments', () => {
    const i = invoice({ status: 'partial', payments: [{ id: 'p1', amount: 20000, method: 'bank_transfer', reference: 'X', at: iso(-20), recordedBy: 'u1' }] });
    ageInvoices([i], NOW.getTime());
    expect(i.status).toBe('overdue');
    expect(i.payments).toHaveLength(1);
  });

  it('never touches draft, paid or cancelled invoices', () => {
    const drafts = [invoice({ status: 'draft' }), invoice({ status: 'paid' }), invoice({ status: 'cancelled' })];
    expect(ageInvoices(drafts, NOW.getTime())).toEqual([]);
    expect(drafts.map(i => i.status)).toEqual(['draft', 'paid', 'cancelled']);
  });

  it('does not age an invoice whose balance is fully settled even if status lags', () => {
    // 100000 NGN + 7.5% VAT = 107500 NGN total.
    const i = invoice({ status: 'sent', payments: [{ id: 'p1', amount: 107500, method: 'bank_transfer', reference: 'X', at: iso(-5), recordedBy: 'u1' }] });
    expect(ageInvoices([i], NOW.getTime())).toEqual([]);
    expect(i.status).toBe('sent');
  });

  it('is idempotent — a second run reports no further changes', () => {
    const i = invoice();
    expect(ageInvoices([i], NOW.getTime())).toEqual([i.id]);
    expect(ageInvoices([i], NOW.getTime())).toEqual([]);
  });

  it('leaves a not-yet-due invoice alone', () => {
    const i = invoice({ dueAt: iso(3) });
    expect(ageInvoices([i], NOW.getTime())).toEqual([]);
    expect(i.status).toBe('sent');
  });
});

describe('ageingSummary', () => {
  it('sums outstanding balances per bucket in kobo, ignoring settled invoices', () => {
    const list = [
      invoice({ dueAt: iso(5) }),                                   // current 107500
      invoice({ dueAt: iso(-5) }),                                  // 1-30    107500
      invoice({ dueAt: iso(-45), payments: [{ id: 'p', amount: 7500, method: 'cash', reference: 'r', at: iso(-40), recordedBy: 'u' }] }), // 31-60 100000
      invoice({ status: 'paid', dueAt: iso(-100) }),                // excluded
      invoice({ status: 'draft', dueAt: iso(-100) }),               // excluded
    ];
    // Amounts are kobo: 100000 NGN = 10_000_000 kobo, +7.5% VAT = 10_750_000.
    const summary = ageingSummary(list, NOW.getTime());
    expect(summary.current).toBe(10_750_000);
    expect(summary['1-30']).toBe(10_750_000);
    expect(summary['31-60']).toBe(10_000_000); // 7500 NGN part-payment = 750_000 kobo off
    expect(summary['61-90']).toBe(0);
    expect(summary['90+']).toBe(0);
    expect(summary.total).toBe(31_500_000);
  });

  it('returns zeroes for an empty ledger', () => {
    const summary = ageingSummary([], NOW.getTime());
    const buckets: AgeBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];
    for (const b of buckets) expect(summary[b]).toBe(0);
    expect(summary.total).toBe(0);
  });
});

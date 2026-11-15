/**
 * Receivables ageing — derived from the invoice and the clock, never a user-issued command.
 *
 * 'overdue' existed in the status union but nothing ever set it, so unpaid invoices sat at
 * 'sent' indefinitely: ageing reports understated risk and finance had no prompt to chase.
 * Keeping this pure means the scheduler, the finance screen and the reports all agree.
 *
 * Money is summed in integer kobo (see money.ts) so bucket totals reconcile exactly with the
 * invoice ledger instead of accumulating float drift.
 */
import type { Invoice } from './types';
import { invoiceBalanceKobo } from './money';

export type AgeBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export const AGE_BUCKETS: readonly AgeBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

const DAY = 86400000;
/** Statuses that can still age. Draft is not yet a receivable; paid/cancelled are closed. */
const OPEN_STATUSES: readonly Invoice['status'][] = ['sent', 'partial', 'overdue'];

export function daysPastDue(invoice: Pick<Invoice, 'dueAt'>, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(invoice.dueAt)) / DAY);
}

export function invoiceAgeBucket(invoice: Pick<Invoice, 'dueAt'>, nowMs: number): AgeBucket {
  const days = daysPastDue(invoice, nowMs);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Move past-due, unpaid invoices to 'overdue'. Mutates in place and returns the ids changed so
 * the caller can audit and notify only for real transitions. Idempotent: a second call at the
 * same clock returns []. An invoice whose payments already cover the total is left alone even
 * if its status lags — settlement, not the clock, decides that.
 */
export function ageInvoices(invoices: Invoice[], nowMs: number): string[] {
  const changed: string[] = [];
  for (const i of invoices) {
    if (!OPEN_STATUSES.includes(i.status) || i.status === 'overdue') continue;
    if (daysPastDue(i, nowMs) <= 0) continue;
    if (invoiceBalanceKobo(i) <= 0) continue;
    i.status = 'overdue';
    changed.push(i.id);
  }
  return changed;
}

export interface AgeingSummary extends Record<AgeBucket, number> { total: number }

/** Outstanding balance per bucket, in kobo. Settled and draft invoices are excluded. */
export function ageingSummary(invoices: Invoice[], nowMs: number): AgeingSummary {
  const out: AgeingSummary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
  for (const i of invoices) {
    if (!OPEN_STATUSES.includes(i.status)) continue;
    const balance = invoiceBalanceKobo(i);
    if (balance <= 0) continue;
    out[invoiceAgeBucket(i, nowMs)] += balance;
    out.total += balance;
  }
  return out;
}

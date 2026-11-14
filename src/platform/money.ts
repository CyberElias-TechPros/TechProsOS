/** NGN display amounts are decimal naira; settlement arithmetic uses integer kobo.
 * Tax rates are explicit invoice inputs, not a claim about a customer's tax liability.
 */
export interface MoneyLine { desc?: string; qty: number; unitPrice: number }
export function toKobo(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) throw new Error('Invalid money amount');
  return Math.round((amount + Number.EPSILON) * 100);
}
export function lineKobo(line: MoneyLine): number {
  if (!Number.isFinite(line.qty) || line.qty <= 0) throw new Error('Quantity must be positive');
  return Math.round(toKobo(line.unitPrice) * line.qty);
}
export function totalsKobo(items: MoneyLine[], vatRate: number, whtRate: number) {
  if (![vatRate, whtRate].every(r => Number.isFinite(r) && r >= 0 && r <= 1)) throw new Error('Invalid tax rate');
  const subtotal = items.reduce((n, item) => n + lineKobo(item), 0);
  const vat = Math.round(subtotal * vatRate);
  const wht = Math.round(subtotal * whtRate);
  const total = subtotal + vat;
  return { subtotal, vat, wht, total, net: total - wht };
}
export interface InvoiceTotals { subtotal: number; vat: number; wht: number; total: number; net: number }
export function invoiceTotals(items: MoneyLine[], vatRate: number, whtRate: number) {
  const t = totalsKobo(items, vatRate, whtRate);
  return { subtotal: t.subtotal / 100, vat: t.vat / 100, wht: t.wht / 100, total: t.total / 100, net: t.net / 100 };
}
export function invoiceBalanceKobo(invoice: { items: MoneyLine[]; vatRate: number; whtRate: number; payments?: { amount: number; method: string }[] }): number {
  const paid = (invoice.payments ?? []).reduce((n, p) => n + toKobo(p.amount), 0);
  return Math.max(0, totalsKobo(invoice.items, invoice.vatRate, invoice.whtRate).total - paid);
}

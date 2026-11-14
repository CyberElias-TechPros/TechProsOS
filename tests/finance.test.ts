import { describe, expect, it } from 'vitest';
import { depreciatedValue, invoiceTotals } from '../src/platform/db';
import { ngn } from '../src/platform/util';

describe('Nigerian invoice math', () => {
  it('computes VAT 7.5% and WHT deduction', () => {
    const t = invoiceTotals([{ desc: 'Managed services', qty: 1, unitPrice: 350000 }], 0.075, 0.05);
    expect(t.subtotal).toBe(350000);
    expect(t.vat).toBe(26250);
    expect(t.wht).toBe(17500);
    expect(t.total).toBe(376250);
    expect(t.net).toBe(358750); // client pays total minus WHT they remit to FIRS
  });

  it('handles multiple lines and zero WHT', () => {
    const t = invoiceTotals(
      [{ desc: 'AP', qty: 6, unitPrice: 245000 }, { desc: 'Cable box', qty: 4, unitPrice: 132000 }],
      0.075, 0,
    );
    expect(t.subtotal).toBe(1470000 + 528000);
    expect(t.vat).toBe(Math.round(t.subtotal * 0.075));
    expect(t.net).toBe(t.total);
  });
});

describe('asset depreciation (straight line)', () => {
  it('holds full value at purchase', () => {
    const v = depreciatedValue({ purchaseCost: 1000000, purchaseDate: new Date().toISOString(), usefulLifeYears: 4 });
    expect(v).toBe(1000000);
  });
  it('halves at mid-life', () => {
    const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const v = depreciatedValue({ purchaseCost: 1000000, purchaseDate: twoYearsAgo.toISOString(), usefulLifeYears: 4 });
    expect(v).toBeGreaterThan(480000);
    expect(v).toBeLessThan(520000);
  });
  it('reaches zero past useful life, never negative', () => {
    const longAgo = new Date(); longAgo.setFullYear(longAgo.getFullYear() - 10);
    expect(depreciatedValue({ purchaseCost: 1000000, purchaseDate: longAgo.toISOString(), usefulLifeYears: 4 })).toBe(0);
  });
});

describe('formatting', () => {
  it('formats naira', () => {
    expect(ngn(1250000)).toContain('₦');
    expect(ngn(1250000)).toContain('1,250,000');
    expect(ngn(2500000, { compact: true })).toBe('₦2.5m');
  });
});

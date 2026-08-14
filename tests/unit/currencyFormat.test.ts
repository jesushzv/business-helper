import { describe, it, expect } from 'vitest';
import { formatMXN } from '@/lib/currencyFormat';

describe('formatMXN', () => {
  it('formats pesos with cents in the es-MX locale', () => {
    expect(formatMXN(15000)).toBe('$15,000.00');
    expect(formatMXN(0.5)).toBe('$0.50');
  });

  it('formats whole pesos for plan prices', () => {
    expect(formatMXN(299, { wholePesos: true })).toBe('$299');
    expect(formatMXN(15000, { wholePesos: true })).toBe('$15,000');
  });

  it('handles negatives the way the ledger shows them', () => {
    expect(formatMXN(-1200)).toBe('-$1,200.00');
  });
});

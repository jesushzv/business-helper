import { describe, it, expect } from 'vitest';
import { formatCurrency, convertCurrency, aggregateMultiCurrencyTotals } from '@/lib/currency';

describe('Multi-Currency Engine (USD / MXN) Suite', () => {
  it('should format monetary amounts with ISO currency codes ($1,500.00 MXN, $100.00 USD)', () => {
    expect(formatCurrency(1500, 'MXN')).toBe('$1,500.00 MXN');
    expect(formatCurrency(100, 'USD')).toBe('$100.00 USD');
    expect(formatCurrency(2500, 'MXN', { showIsoCode: false })).toBe('$2,500.00');
  });

  it('should convert USD to MXN using exchange rate correctly', () => {
    const mxn = convertCurrency(100, 'USD', 'MXN', 20.0);
    expect(mxn).toBe(2000);

    const usd = convertCurrency(2000, 'MXN', 'USD', 20.0);
    expect(usd).toBe(100);
  });

  it('should aggregate multi-currency line items into a unified MXN base total', () => {
    const items = [
      { amount: 1000, currency: 'MXN' },
      { amount: 100, currency: 'USD' },
    ];
    const aggregated = aggregateMultiCurrencyTotals(items, 'MXN', 20.0);
    expect(aggregated).toBe(3000); // 1000 MXN + (100 USD * 20) = 3000 MXN
  });
});

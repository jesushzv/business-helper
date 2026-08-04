import { describe, it, expect } from 'vitest';
import { calculateQuoteTaxes } from '@/lib/taxCalculator';

describe('SAT Tax Calculation Engine', () => {
  it('should calculate standard 16% IVA correctly for subtotal $10,000 MXN', () => {
    const breakdown = calculateQuoteTaxes(10000, true, false, false);
    expect(breakdown.subtotal).toBe(10000);
    expect(breakdown.ivaAmount).toBe(1600);
    expect(breakdown.retencionIsrAmount).toBe(0);
    expect(breakdown.retencionIvaAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(11600);
  });

  it('should calculate 10% ISR withholding for RESICO / professional services', () => {
    const breakdown = calculateQuoteTaxes(10000, true, true, false);
    expect(breakdown.subtotal).toBe(10000);
    expect(breakdown.ivaAmount).toBe(1600);
    expect(breakdown.retencionIsrAmount).toBe(1000);
    expect(breakdown.retencionIvaAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(10600);
  });

  it('should calculate 10.6667% IVA withholding (2/3 of IVA)', () => {
    const breakdown = calculateQuoteTaxes(10000, true, false, true);
    expect(breakdown.subtotal).toBe(10000);
    expect(breakdown.ivaAmount).toBe(1600);
    expect(breakdown.retencionIvaAmount).toBe(1066.67);
    expect(breakdown.totalAmount).toBe(10533.33);
  });

  it('should handle zero tax options correctly when IVA is disabled', () => {
    const breakdown = calculateQuoteTaxes(5000, false, false, false);
    expect(breakdown.subtotal).toBe(5000);
    expect(breakdown.ivaAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(5000);
  });

  it('should calculate full breakdown with both ISR and IVA withholdings', () => {
    const breakdown = calculateQuoteTaxes(10000, true, true, true);
    expect(breakdown.subtotal).toBe(10000);
    expect(breakdown.ivaAmount).toBe(1600);
    expect(breakdown.retencionIsrAmount).toBe(1000);
    expect(breakdown.retencionIvaAmount).toBe(1066.67);
    expect(breakdown.totalAmount).toBe(9533.33);
  });
});

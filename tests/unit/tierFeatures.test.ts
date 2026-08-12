import { describe, it, expect } from 'vitest';
import { APP_TIERS, PAIN_POINTS_SOLUTIONS, VALUE_ADDS_ROI } from '@/lib/tierFeaturesData';

describe('App Tier Features & Value-Adds Data Engine', () => {
  it('defines exactly three priced tiers', () => {
    expect(APP_TIERS).toHaveLength(3);
    expect(APP_TIERS.map((t) => t.id)).toEqual(['inicial', 'pro', 'enterprise']);
    expect(APP_TIERS.map((t) => t.priceMonthly)).toEqual([299, 599, 999]);
  });

  it('marks the middle tier as the recommended one', () => {
    const recommended = APP_TIERS.filter((t) => t.recommended);

    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe('pro');
  });

  it('states the BYOK CFDI story on every tier — never a folio allowance (#221)', () => {
    // The platform never stamps on behalf of tenants (docs/STATUS.md §05), so
    // every tier carries the same claim: your own PAC, billed by your PAC.
    for (const tier of APP_TIERS) {
      expect(
        tier.features.some((f) => f.includes('CFDI 4.0') && f.includes('con tu propio PAC')),
        `${tier.id} must state the con-tu-propio-PAC CFDI line`
      ).toBe(true);
    }
  });

  it('gives every tier a name, description and call to action', () => {
    for (const tier of APP_TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.description.length).toBeGreaterThan(0);
      expect(tier.ctaText.length).toBeGreaterThan(0);
      expect(tier.features.length).toBeGreaterThan(0);
    }
  });

  it('maps the core PyME pain points onto quoting, collection and SAT impact', () => {
    expect(PAIN_POINTS_SOLUTIONS.length).toBeGreaterThanOrEqual(4);
    expect(PAIN_POINTS_SOLUTIONS[0].impact).toContain('Cotizaciones');
    expect(PAIN_POINTS_SOLUTIONS[1].impact).toContain('Cobro');
    expect(PAIN_POINTS_SOLUTIONS[2].impact).toContain('SAT');
  });

  it('quantifies each ROI value-add with a metric and a label', () => {
    expect(VALUE_ADDS_ROI.length).toBeGreaterThan(0);
    for (const value of VALUE_ADDS_ROI) {
      expect(value.metric.length).toBeGreaterThan(0);
      expect(value.label.length).toBeGreaterThan(0);
    }
  });
});

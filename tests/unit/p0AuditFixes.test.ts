import { describe, it, expect } from 'vitest';
import { STRIPE_PLANS, getStripeTierConfig } from '@/lib/stripe';
import { APP_TIERS } from '@/lib/tierFeaturesData';
import { CONTACT_INFO } from '@/lib/trustData';

describe('P0 Audit Fixes — Verification Suite', () => {
  it('should enforce Plan Inicial as the canonical $299 plan name and inicial slug', () => {
    expect(STRIPE_PLANS.inicial).toBeDefined();
    expect(STRIPE_PLANS.inicial.name).toBe('Plan Inicial');
    expect(STRIPE_PLANS.inicial.price).toBe(299);

    const config = getStripeTierConfig('inicial');
    expect(config.id).toBe('inicial');
    expect(config.name).toBe('Plan Inicial');

    const basicTier = APP_TIERS.find((t) => t.id === 'inicial');
    expect(basicTier).toBeDefined();
    expect(basicTier?.name).toBe('Plan Inicial');
    expect(basicTier?.priceMonthly).toBe(299);
  });

  it('should enforce Tijuana, B.C., México / San Diego, CA as legal address', () => {
    expect(CONTACT_INFO.cityState).toBe('Tijuana, B.C., México / San Diego, CA');
    expect(CONTACT_INFO.country).toBe('México / EE.UU.');
  });

  it('should enforce businesshelper.app domain for all official emails', () => {
    expect(CONTACT_INFO.email).toBe('contacto@businesshelper.app');
    expect(CONTACT_INFO.supportEmail).toBe('soporte@businesshelper.app');
    expect(CONTACT_INFO.privacyEmail).toBe('privacidad@businesshelper.app');
    expect(CONTACT_INFO.founderEmail).toBe('hector@businesshelper.app');
  });
});

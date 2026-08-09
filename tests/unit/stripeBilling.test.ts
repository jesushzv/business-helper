import { describe, it, expect } from 'vitest';
import {
  STRIPE_PLANS,
  STRIPE_FOLIO_PACKS,
  getStripeTierConfig,
  createCheckoutPayload,
  createFolioPackCheckoutPayload,
  validateSubscriptionStatus,
  handleStripeWebhookEvent,
  auditStripeEnvironment,
  normalizeTierKey,
  resolveTierPriceId,
  resolveTierFromPriceId,
} from '@/lib/stripe';

describe('WS-B Stripe Production Billing & Folio Packs Engine', () => {
  // The 'emprendedor' tier was renamed to 'inicial' in 4f3e260. This test kept
  // asserting the old key; the same drift left the subscription_tier CHECK
  // constraint requiring 'emprendedor' while the app wrote 'inicial', so every
  // webhook tier write failed at the database behind a 200 response.
  it('should define 3 core subscription plans (inicial, negocio, empresa)', () => {
    expect(STRIPE_PLANS.inicial.price).toBe(299);
    expect(STRIPE_PLANS.negocio.price).toBe(599);
    expect(STRIPE_PLANS.empresa.price).toBe(999);
    expect(STRIPE_PLANS.negocio.includedFolios).toBe(10);
    expect(STRIPE_PLANS.empresa.includedFolios).toBe(50);
  });

  it('should define folio add-on packs (50 for $100 MXN / 200 for $350 MXN)', () => {
    expect(STRIPE_FOLIO_PACKS.folio_pack_50.price).toBe(100);
    expect(STRIPE_FOLIO_PACKS.folio_pack_50.folios).toBe(50);
    expect(STRIPE_FOLIO_PACKS.folio_pack_200.price).toBe(350);
    expect(STRIPE_FOLIO_PACKS.folio_pack_200.folios).toBe(200);
  });

  it('should fallback to inicial config for invalid tier key', () => {
    // Entitlement reads fail closed: an unrecognised stored tier gets the
    // smallest plan, never folios it did not buy.
    const config = getStripeTierConfig('invalid_plan');
    expect(config.id).toBe('inicial');
  });

  it('should still accept the legacy emprendedor key as an alias', () => {
    // getStripeTierConfig maps the old name forward, so existing links and
    // stored values keep resolving after the rename.
    expect(getStripeTierConfig('emprendedor').id).toBe('inicial');
  });

  it('should construct valid subscription checkout payload with organization_id metadata', () => {
    const built = createCheckoutPayload('negocio', 'org_test_123', undefined, {
      STRIPE_PRICE_NEGOCIO: 'price_live_negocio',
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const payload = built.payload as Record<string, never> & {
      mode: string;
      metadata: { organization_id: string; tier_id: string };
      line_items: Array<{ price: string }>;
      success_url: string;
    };

    expect(payload.mode).toBe('subscription');
    expect(payload.metadata.organization_id).toBe('org_test_123');
    expect(payload.metadata.tier_id).toBe('negocio');
    expect(payload.line_items[0].price).toBe('price_live_negocio');
    expect(payload.success_url).toContain('status=success');
  });

  it('should construct valid folio pack checkout payload with pack_id metadata', () => {
    const built = createFolioPackCheckoutPayload('folio_pack_200', 'org_test_456', undefined, {
      STRIPE_PRICE_FOLIO_200: 'price_live_folio_200',
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const payload = built.payload as Record<string, never> & {
      mode: string;
      metadata: { organization_id: string; pack_id: string; folios: string };
      line_items: Array<{ price: string }>;
    };

    expect(payload.mode).toBe('payment');
    expect(payload.metadata.organization_id).toBe('org_test_456');
    expect(payload.metadata.pack_id).toBe('folio_pack_200');
    expect(payload.metadata.folios).toBe('200');
    expect(payload.line_items[0].price).toBe('price_live_folio_200');
  });

  it('should evaluate subscription status accessibility correctly', () => {
    expect(validateSubscriptionStatus('active').isAccessible).toBe(true);
    expect(validateSubscriptionStatus('trialing').isAccessible).toBe(true);
    expect(validateSubscriptionStatus('past_due').isAccessible).toBe(true);
    expect(validateSubscriptionStatus('canceled').isAccessible).toBe(false);
  });

  it('should process Stripe webhook events correctly', () => {
    const checkoutRes = handleStripeWebhookEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org_123',
          metadata: { organization_id: 'org_123', tier_id: 'negocio' },
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    });
    expect(checkoutRes.eventType).toBe('checkout.session.completed');
    expect(checkoutRes.organizationId).toBe('org_123');
    expect(checkoutRes.tierId).toBe('negocio');

    const cancelRes = handleStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { organization_id: 'org_123' },
          id: 'sub_123',
        },
      },
    });
    expect(cancelRes.eventType).toBe('customer.subscription.deleted');
    expect(cancelRes.organizationId).toBe('org_123');
  });

  it('should audit Stripe environment keys (sandbox vs live vs unconfigured)', () => {
    const auditSandbox = auditStripeEnvironment({
      STRIPE_SECRET_KEY: 'sk_test_12345',
      STRIPE_WEBHOOK_SECRET: 'whsec_12345',
      STRIPE_PRICE_INICIAL: 'price_test_inicial',
      STRIPE_PRICE_NEGOCIO: 'price_test_negocio',
      STRIPE_PRICE_EMPRESA: 'price_test_empresa',
    });
    expect(auditSandbox.mode).toBe('sandbox');
    expect(auditSandbox.isReady).toBe(true);

    const auditUnconfigured = auditStripeEnvironment({});
    expect(auditUnconfigured.mode).toBe('unconfigured');
    expect(auditUnconfigured.isReady).toBe(false);
  });
});

/**
 * #68 — live mode cannot be reached by setting a key alone. These pin the
 * three ways the old code let an unconfigured or mismapped price map pass for
 * a working one.
 */
describe('Stripe live-mode price mapping (#68)', () => {
  const LIVE_ENV = {
    STRIPE_SECRET_KEY: 'sk_live_realkey',
    STRIPE_WEBHOOK_SECRET: 'whsec_realsecret',
    STRIPE_PRICE_INICIAL: 'price_1LiveInicial',
    STRIPE_PRICE_NEGOCIO: 'price_1LiveNegocio',
    STRIPE_PRICE_EMPRESA: 'price_1LiveEmpresa',
  };

  it('resolves a tier price only from the environment — never a placeholder', () => {
    expect(resolveTierPriceId('negocio', LIVE_ENV)).toBe('price_1LiveNegocio');
    // The variable is unset: absent is absent, not `price_negocio_599_mxn`.
    expect(resolveTierPriceId('negocio', {})).toBeNull();
    expect(resolveTierPriceId('empresa', { STRIPE_PRICE_EMPRESA: '   ' })).toBeNull();
  });

  it('still honours the pre-rename STRIPE_PRICE_EMPRENDEDOR variable', () => {
    expect(resolveTierPriceId('inicial', { STRIPE_PRICE_EMPRENDEDOR: 'price_legacy' })).toBe(
      'price_legacy'
    );
    // The current name wins when both are set.
    expect(
      resolveTierPriceId('inicial', {
        STRIPE_PRICE_INICIAL: 'price_current',
        STRIPE_PRICE_EMPRENDEDOR: 'price_legacy',
      })
    ).toBe('price_current');
  });

  it('refuses to build a checkout payload for a tier with no price id', () => {
    const built = createCheckoutPayload('empresa', 'org_1', undefined, {
      STRIPE_PRICE_NEGOCIO: 'price_1LiveNegocio',
    });

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('PRICE_NOT_CONFIGURED');
    // The caller has to be able to name the variable the founder must set.
    if (built.code !== 'PRICE_NOT_CONFIGURED') return;
    expect(built.envVar).toBe('STRIPE_PRICE_EMPRESA');
  });

  it('an unknown tier key is refused rather than silently billed as another tier', () => {
    const built = createCheckoutPayload('plan_pirata', 'org_1', undefined, LIVE_ENV);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe('UNKNOWN_TIER');
  });

  it('every tier the product advertises maps to the plan it advertises', () => {
    // The pricing page sells starter/pro/business; tierFeaturesData calls them
    // inicial/pro/enterprise; the database stores inicial/negocio/empresa.
    // 'pro' used to fall through to Inicial — the $599 customer on the
    // 0-folio entitlement.
    expect(normalizeTierKey('starter')).toBe('inicial');
    expect(normalizeTierKey('pro')).toBe('negocio');
    expect(normalizeTierKey('business')).toBe('empresa');
    expect(normalizeTierKey('enterprise')).toBe('empresa');
    expect(normalizeTierKey('desconocido')).toBeNull();
  });

  it('an unrecognised price id resolves to no tier instead of defaulting to negocio', () => {
    expect(resolveTierFromPriceId('price_1LiveEmpresa', LIVE_ENV)).toBe('empresa');
    // A live price this deployment has never been told about tells us nothing.
    expect(resolveTierFromPriceId('price_1SomethingElse', LIVE_ENV)).toBeNull();
    expect(resolveTierFromPriceId('', LIVE_ENV)).toBeNull();
  });

  it('a webhook event with no attributable tier reports null, not a guess', () => {
    const unattributable = handleStripeWebhookEvent(
      {
        type: 'customer.subscription.updated',
        data: {
          object: {
            metadata: { organization_id: '11111111-1111-1111-1111-111111111111' },
            status: 'active',
            items: { data: [{ price: { id: 'price_1Unknown' } }] },
          },
        },
      },
      LIVE_ENV
    );

    expect(unattributable.tierId).toBeNull();
    expect(unattributable.status).toBe('active');

    // …while a mapped price still resolves.
    const mapped = handleStripeWebhookEvent(
      {
        type: 'customer.subscription.updated',
        data: {
          object: {
            metadata: { organization_id: '11111111-1111-1111-1111-111111111111' },
            status: 'active',
            items: { data: [{ price: { id: 'price_1LiveEmpresa' } }] },
          },
        },
      },
      LIVE_ENV
    );

    expect(mapped.tierId).toBe('empresa');
  });

  it('an event without an organization reports null rather than org_demo', () => {
    const orphan = handleStripeWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: { status: 'active' } },
    });
    expect(orphan.organizationId).toBeNull();
  });

  it('a live key with no price map does not audit as ready', () => {
    const audit = auditStripeEnvironment({
      STRIPE_SECRET_KEY: 'sk_live_realkey',
      STRIPE_WEBHOOK_SECRET: 'whsec_realsecret',
    });

    expect(audit.mode).toBe('live');
    expect(audit.isReady).toBe(false);
    expect(audit.unconfiguredTiers).toEqual(['inicial', 'negocio', 'empresa']);
    expect(audit.priceIds.negocio).toBeNull();
    expect(audit.missingKeys).toContain('STRIPE_PRICE_NEGOCIO');
  });

  it('a fully mapped live environment audits as ready', () => {
    const audit = auditStripeEnvironment(LIVE_ENV);
    expect(audit.mode).toBe('live');
    expect(audit.isReady).toBe(true);
    expect(audit.unconfiguredTiers).toEqual([]);
    expect(audit.missingKeys).toEqual([]);
  });
});

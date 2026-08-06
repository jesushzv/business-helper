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
    const config = getStripeTierConfig('invalid_plan');
    expect(config.id).toBe('inicial');
  });

  it('should still accept the legacy emprendedor key as an alias', () => {
    // getStripeTierConfig maps the old name forward, so existing links and
    // stored values keep resolving after the rename.
    expect(getStripeTierConfig('emprendedor').id).toBe('inicial');
  });

  it('should construct valid subscription checkout payload with organization_id metadata', () => {
    const payload = createCheckoutPayload('negocio', 'org_test_123');
    expect(payload.mode).toBe('subscription');
    expect(payload.metadata.organization_id).toBe('org_test_123');
    expect(payload.metadata.tier_id).toBe('negocio');
    expect(payload.success_url).toContain('status=success');
  });

  it('should construct valid folio pack checkout payload with pack_id metadata', () => {
    const payload = createFolioPackCheckoutPayload('folio_pack_200', 'org_test_456');
    expect(payload.mode).toBe('payment');
    expect(payload.metadata.organization_id).toBe('org_test_456');
    expect(payload.metadata.pack_id).toBe('folio_pack_200');
    expect(payload.metadata.folios).toBe('200');
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
    });
    expect(auditSandbox.mode).toBe('sandbox');
    expect(auditSandbox.isReady).toBe(true);

    const auditUnconfigured = auditStripeEnvironment({});
    expect(auditUnconfigured.mode).toBe('unconfigured');
    expect(auditUnconfigured.isReady).toBe(false);
  });
});

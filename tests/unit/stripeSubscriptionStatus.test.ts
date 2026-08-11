import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  normalizeSubscriptionStatus,
  validateSubscriptionStatus,
  handleStripeWebhookEvent,
} from '@/lib/stripe';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #116 — the subscription vocabulary was unpinned at both ends.
 *
 * `checkout.session.completed` is a handled event whose `data.object` is a
 * **Checkout Session**, not a Subscription: its `status` is
 * 'complete' | 'open' | 'expired'. The handler read `obj.status` blindly, so a
 * completed checkout tried to write `subscription_status = 'complete'` — a word
 * `chk_subscription_status` rejects and `validateSubscriptionStatus` badged as
 * "Cancelado" for the customer who had just paid.
 *
 * Existing tests only ever fed subscription-shaped objects, which is why
 * neither end was caught.
 */

const ORG = '11111111-1111-1111-1111-111111111111';

describe('normalizeSubscriptionStatus', () => {
  it('accepts exactly the vocabulary the column allows', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(normalizeSubscriptionStatus(status)).toBe(status);
    }
  });

  it('matches the CHECK constraint in the migration that widened it', () => {
    const migration = readFileSync(
      join('supabase', 'migrations', '20260806120000_security_hardening.sql'),
      'utf8'
    );
    const check = /chk_subscription_status\s+CHECK \(subscription_status IN \(([^)]*)\)/.exec(
      migration
    );

    expect(check, 'chk_subscription_status not found in the migration').not.toBeNull();
    const allowed = (check?.[1] ?? '')
      .split(',')
      .map((value) => value.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);

    expect(allowed.length).toBe(SUBSCRIPTION_STATUSES.length);
    expect([...allowed].sort()).toEqual([...SUBSCRIPTION_STATUSES].sort());
  });

  it('refuses a Checkout Session status rather than mapping it onto a subscription one', () => {
    for (const sessionStatus of ['complete', 'open', 'expired']) {
      expect(normalizeSubscriptionStatus(sessionStatus)).toBeNull();
    }
    expect(normalizeSubscriptionStatus('')).toBeNull();
    expect(normalizeSubscriptionStatus(undefined)).toBeNull();
    expect(normalizeSubscriptionStatus({ status: 'active' })).toBeNull();
  });
});

describe('handleStripeWebhookEvent — the status it reports', () => {
  it('reports no status for checkout.session.completed, whose object is a Session', () => {
    const handled = handleStripeWebhookEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          status: 'complete',
          payment_status: 'paid',
          metadata: { organization_id: ORG, tier_id: 'negocio' },
        },
      },
    });

    // The tier is still attributable from the metadata Checkout carries…
    expect(handled.tierId).toBe('negocio');
    // …but the status is not on this object, and 'complete' is not one of ours.
    expect(handled.status).toBeNull();
  });

  it('still reads the status off a real subscription event', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid'] as const) {
      const handled = handleStripeWebhookEvent({
        type: 'customer.subscription.updated',
        data: { object: { status, metadata: { organization_id: ORG } } },
      });
      expect(handled.status).toBe(status);
    }
  });

  it('reports canceled for a deletion whatever the object says', () => {
    const handled = handleStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: { object: { status: 'active', metadata: { organization_id: ORG } } },
    });
    expect(handled.status).toBe('canceled');
  });

  it('reports null — not active — for a subscription event with an unmodelled status', () => {
    const handled = handleStripeWebhookEvent({
      type: 'customer.subscription.updated',
      data: { object: { status: 'paused', metadata: { organization_id: ORG } } },
    });
    expect(handled.status).toBeNull();
  });
});

describe('the webhook route writes only the columns the event established', () => {
  const route = readFileSync(join('app', 'api', 'stripe', 'webhook', 'route.ts'), 'utf8');

  it('never puts the handled status into the update unconditionally', () => {
    // The old body was `subscription_status: handled.status,` inside the object
    // literal; it is now written only under `if (handled.status)`.
    expect(route).not.toMatch(/subscription_status:\s*handled\.status,\n\s*updated_at/);
    expect(route).toMatch(
      /if \(handled\.status\) \{\s*update\.subscription_status = handled\.status;/
    );
  });
});

describe('validateSubscriptionStatus', () => {
  it('does not badge an unrecognised status as Cancelado', () => {
    for (const unknown of ['complete', 'paused', 'lo-que-sea']) {
      const result = validateSubscriptionStatus(unknown);
      expect(result.badgeText).toBe('Estado desconocido');
      expect(result.isAccessible).toBe(false);
    }
  });

  it('keeps the known statuses reading the way they read before', () => {
    expect(validateSubscriptionStatus('active').badgeText).toBe('Activo');
    expect(validateSubscriptionStatus('trialing').isAccessible).toBe(true);
    expect(validateSubscriptionStatus('past_due').badgeText).toBe('Pago Pendiente');
    expect(validateSubscriptionStatus('canceled').badgeText).toBe('Cancelado');
    expect(validateSubscriptionStatus('unpaid').isAccessible).toBe(false);
  });

  it('tells an unfinished checkout apart from a cancellation', () => {
    // 'incomplete' means the payment was never completed — actionable, and not
    // the same news as "your subscription was cancelled".
    expect(validateSubscriptionStatus('incomplete').badgeText).toBe('Pago sin completar');
    expect(validateSubscriptionStatus('incomplete_expired').isAccessible).toBe(false);
  });
});

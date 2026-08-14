import { describe, it, expect } from 'vitest';
import {
  SUBSCRIPTION_STATUSES,
  normalizeSubscriptionStatus,
  validateSubscriptionStatus,
  statusHoldsPlan,
  handleStripeWebhookEvent,
  readStripeId,
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

  it('defaults to unknown, not to active, when the caller has no status', () => {
    // The default parameter used to be `'active'`: a caller that had learned
    // nothing was handed a healthy subscription (#116, the last site).
    for (const nothing of [undefined, '']) {
      const result = validateSubscriptionStatus(nothing);
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

/**
 * #115 — `organizations.stripe_customer_id` and `stripe_subscription_id` exist
 * in the schema (both `text UNIQUE`) and nothing ever wrote them.
 *
 * Three reads, zero writes: the checkout route's customer-reuse branch reads a
 * column that is always null, so every upgrade mints a fresh Stripe customer
 * for the same organization — Stripe will bill all of them — and with no
 * subscription id stored, "cancel my plan" cannot be answered by the app at
 * all. The ids ride on the same events this route already handles.
 */
describe('handleStripeWebhookEvent — the Stripe ids it reports (#115)', () => {
  it('reads customer and subscription off a Checkout Session', () => {
    const handled = handleStripeWebhookEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          customer: 'cus_ABC123',
          subscription: 'sub_XYZ789',
          metadata: { organization_id: ORG },
        },
      },
    });

    expect(handled.customerId).toBe('cus_ABC123');
    // A Session names the subscription it created in `subscription`; its own
    // `id` is a `cs_…`, which must never reach a sub_ column.
    expect(handled.subscriptionId).toBe('sub_XYZ789');
    expect(handled.clearsSubscriptionId).toBe(false);
  });

  it('reads a Subscription event: the object is the subscription', () => {
    const handled = handleStripeWebhookEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_LIVE1',
          customer: 'cus_LIVE1',
          status: 'active',
          metadata: { organization_id: ORG },
        },
      },
    });

    expect(handled.customerId).toBe('cus_LIVE1');
    expect(handled.subscriptionId).toBe('sub_LIVE1');
  });

  it('accepts an expanded object as well as a bare id', () => {
    const handled = handleStripeWebhookEvent({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_EXP1',
          customer: { id: 'cus_EXP1', object: 'customer' },
          status: 'active',
          metadata: { organization_id: ORG },
        },
      },
    });

    expect(handled.customerId).toBe('cus_EXP1');
  });

  it('refuses an id of the wrong kind rather than storing it in a UNIQUE column', () => {
    // The shape that would have done the damage: a Session whose `id` gets read
    // as the subscription, writing `cs_…` into a column other tenants share.
    const handled = handleStripeWebhookEvent({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_2', metadata: { organization_id: ORG } } },
    });

    expect(handled.subscriptionId).toBeNull();
    expect(handled.customerId).toBeNull();

    expect(readStripeId('cus_OK', 'cus_')).toBe('cus_OK');
    expect(readStripeId('sub_OK', 'cus_')).toBeNull();
    expect(readStripeId('cus_bad id', 'cus_')).toBeNull();
    expect(readStripeId(undefined, 'sub_')).toBeNull();
    expect(readStripeId({}, 'sub_')).toBeNull();
  });

  it('marks a deletion as clearing the subscription id, keeping the customer', () => {
    const handled = handleStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_GONE', customer: 'cus_STAYS', metadata: { organization_id: ORG } },
      },
    });

    expect(handled.clearsSubscriptionId).toBe(true);
    expect(handled.customerId).toBe('cus_STAYS');
  });
});

describe('the webhook route stores the ids the event carried (#115)', () => {
  const route = readFileSync(join('app', 'api', 'stripe', 'webhook', 'route.ts'), 'utf8');

  it('writes each id only when the event named it', () => {
    expect(route).toMatch(/if \(handled\.customerId\) \{\s*update\.stripe_customer_id = handled\.customerId;/);
    expect(route).toMatch(/else if \(handled\.subscriptionId\) \{\s*update\.stripe_subscription_id = handled\.subscriptionId;/);
  });

  it('clears the subscription id on a deletion instead of leaving a dead one', () => {
    expect(route).toMatch(/if \(handled\.clearsSubscriptionId\) \{[\s\S]*?update\.stripe_subscription_id = null;/);
  });
});

/**
 * #267 — "which plan do they hold" is not "which plan does the tier column
 * name".
 *
 * The webhook writes `subscription_tier` on every attributable event,
 * `customer.subscription.deleted` included, so the column outlives the
 * subscription. The settings card read it alone and told a cancelled customer
 * "Tu Plan Actual" over a disabled "Plan Activo" button.
 */
describe('statusHoldsPlan', () => {
  it('holds the plan while the subscription is live', () => {
    // `past_due` included: Stripe is still retrying, the subscription exists,
    // and re-buying it would create a second one.
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(statusHoldsPlan(status)).toBe(true);
    }
  });

  it('does not hold the plan once it lapsed, so it can be bought again', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired']) {
      expect(statusHoldsPlan(status)).toBe(false);
    }
  });

  it('treats an unknown or missing status as not held', () => {
    // Never guess a live subscription from a word we do not model (#116).
    for (const status of ['paused', 'complete', '', null, undefined]) {
      expect(statusHoldsPlan(status)).toBe(false);
    }
  });
});

describe('unpaid is not a cancellation', () => {
  it('names the lapsed payment instead of calling the subscription cancelled', () => {
    // In Stripe, `unpaid` means the subscription still exists and every retry
    // failed — the customer fixes it with their card. "Cancelado" hid that,
    // the same way it once hid `incomplete` (#267).
    const result = validateSubscriptionStatus('unpaid');

    expect(result.badgeText).toBe('Pago vencido');
    expect(result.badgeText).not.toBe('Cancelado');
    expect(result.isAccessible).toBe(false);
  });

  it('leaves a real cancellation reading as one', () => {
    expect(validateSubscriptionStatus('canceled').badgeText).toBe('Cancelado');
  });
});

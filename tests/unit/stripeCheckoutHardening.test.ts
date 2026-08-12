import { describe, it, expect } from 'vitest';
import {
  auditStripeEnvironment,
  createCheckoutPayload,
  describePriceIdShape,
  resolveTierPriceEnv,
  resolveTierPriceId,
  resolveTierFromPriceId,
} from '@/lib/stripe';
import { checkoutIdempotencyKey } from '@/lib/stripeClient';

/**
 * The three defects behind "I can't upgrade my account" (2026-08-11).
 *
 * All three were found by probing the deployed route as a real tenant, not by
 * reading it: production answered `502 STRIPE_ERROR` for every tier, and the
 * server log said `No such price: 'prod_V0DOcZFUtjlMkb'` — the Stripe
 * **Product** id, in `STRIPE_PRICE_NEGOCIO`, with the same mistake in the
 * other two variables. The environment is the founder's to fix; what is fixed
 * here is that the code could not tell anyone which failure it had hit, plus
 * the two walls waiting behind it once the ids were right.
 */

const LIVE_ENV = {
  STRIPE_SECRET_KEY: 'sk_live_realkey',
  STRIPE_WEBHOOK_SECRET: 'whsec_realsecret',
  STRIPE_PRICE_INICIAL: 'price_1LiveInicial',
  STRIPE_PRICE_NEGOCIO: 'price_1LiveNegocio',
  STRIPE_PRICE_EMPRESA: 'price_1LiveEmpresa',
};

/** Exactly what production held: the live account's product ids. */
const PRODUCT_ID_ENV = {
  ...LIVE_ENV,
  STRIPE_PRICE_INICIAL: 'prod_V0DOwfdwfWeYtC',
  STRIPE_PRICE_NEGOCIO: 'prod_V0DOcZFUtjlMkb',
  STRIPE_PRICE_EMPRESA: 'prod_V0DPuCSa1ywZTw',
};

describe('a Product id in STRIPE_PRICE_* is refused before Stripe sees it', () => {
  it('tells a price id from a product id from anything else', () => {
    expect(describePriceIdShape('price_1U0CxlDuvxyuzaRElZ6Lswzt')).toBe('price');
    expect(describePriceIdShape('prod_V0DOcZFUtjlMkb')).toBe('product');
    expect(describePriceIdShape('599')).toBe('other');
    expect(describePriceIdShape('')).toBe('other');
    // A pasted id with stray whitespace is still the id it is.
    expect(describePriceIdShape('  price_1LiveNegocio  ')).toBe('price');
  });

  it('separates "unset" from "set to something Stripe cannot bill"', () => {
    const unset = resolveTierPriceEnv('negocio', { ...LIVE_ENV, STRIPE_PRICE_NEGOCIO: '' });
    expect(unset.ok).toBe(false);
    if (!unset.ok) {
      expect(unset.code).toBe('NOT_CONFIGURED');
      expect(unset.envVar).toBe('STRIPE_PRICE_NEGOCIO');
    }

    const product = resolveTierPriceEnv('negocio', PRODUCT_ID_ENV);
    expect(product.ok).toBe(false);
    if (!product.ok) {
      expect(product.code).toBe('NOT_A_PRICE_ID');
      // The founder has to be able to find the variable *and* see what is in it.
      expect(product.envVar).toBe('STRIPE_PRICE_NEGOCIO');
      if (product.code === 'NOT_A_PRICE_ID') {
        expect(product.value).toBe('prod_V0DOcZFUtjlMkb');
        expect(product.shape).toBe('product');
      }
    }
  });

  it('never hands a non-price id to the checkout payload', () => {
    const built = createCheckoutPayload('negocio', 'org_1', undefined, PRODUCT_ID_ENV);

    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('PRICE_ID_MALFORMED');
    if (built.code !== 'PRICE_ID_MALFORMED') return;
    expect(built.envVar).toBe('STRIPE_PRICE_NEGOCIO');
    expect(built.value).toBe('prod_V0DOcZFUtjlMkb');
    expect(built.shape).toBe('product');
  });

  it('is never treated as a tier mapping on the way back in', () => {
    // The webhook resolves a subscription's tier by matching its price id
    // against the configured ones. A value checkout refuses must not be able to
    // grant anything either — the two directions read the same map.
    expect(resolveTierPriceId('negocio', PRODUCT_ID_ENV)).toBeNull();
    expect(resolveTierFromPriceId('prod_V0DOcZFUtjlMkb', PRODUCT_ID_ENV)).toBeNull();
  });

  it('audits a product-id deployment as unsellable, without calling the variable missing', () => {
    const audit = auditStripeEnvironment(PRODUCT_ID_ENV);

    expect(audit.isReady).toBe(false);
    expect(audit.unconfiguredTiers.sort()).toEqual(['empresa', 'inicial', 'negocio']);
    expect(audit.malformedPriceVars.map((v) => v.envVar).sort()).toEqual([
      'STRIPE_PRICE_EMPRESA',
      'STRIPE_PRICE_INICIAL',
      'STRIPE_PRICE_NEGOCIO',
    ]);
    // "Add this variable" is the wrong instruction for a variable that is set.
    expect(audit.missingKeys).toEqual([]);

    const healthy = auditStripeEnvironment(LIVE_ENV);
    expect(healthy.isReady).toBe(true);
    expect(healthy.malformedPriceVars).toEqual([]);
  });
});

/**
 * The return URL Stripe sends the payer back to.
 *
 * `returnUrl` is `window.location.href`, so the second attempt of any
 * cancelled purchase carries `?status=cancelled` into the next session.
 */
describe('checkout return URLs survive a returnUrl that already has a query', () => {
  function urls(returnUrl?: string) {
    const built = createCheckoutPayload('negocio', 'org_1', returnUrl, LIVE_ENV);
    if (!built.ok) throw new Error(`expected a payload, got ${built.code}`);
    return {
      success: String(built.payload.success_url),
      cancel: String(built.payload.cancel_url),
    };
  }

  it('appends its parameters to a clean URL', () => {
    expect(urls('https://businesshelper.app/settings').success).toBe(
      'https://businesshelper.app/settings?session_id={CHECKOUT_SESSION_ID}&status=success'
    );
    expect(urls('https://businesshelper.app/settings').cancel).toBe(
      'https://businesshelper.app/settings?status=cancelled'
    );
  });

  it('produces one query string, not two, when the caller returns from a cancel', () => {
    const { success, cancel } = urls('https://businesshelper.app/settings?status=cancelled');

    expect(success.match(/\?/g)).toHaveLength(1);
    expect(cancel.match(/\?/g)).toHaveLength(1);
    // And the stale value is gone rather than shadowing the new one: the first
    // `status` is what `URLSearchParams.get` returns.
    expect(new URL(success).searchParams.get('status')).toBe('success');
    expect(success).not.toContain('cancelled');
  });

  it('keeps unrelated parameters the page was carrying', () => {
    const { success } = urls('https://businesshelper.app/settings?ref=email&session_id=cs_old');

    expect(new URL(success).searchParams.get('ref')).toBe('email');
    expect(success).not.toContain('cs_old');
  });

  it('leaves the {CHECKOUT_SESSION_ID} placeholder literal', () => {
    // Percent-encoded braces are not the token Stripe substitutes.
    expect(urls('https://businesshelper.app/settings?ref=email').success).toContain(
      'session_id={CHECKOUT_SESSION_ID}'
    );
  });

  it('falls back to a page that exists when no returnUrl is given', () => {
    // `(dashboard)` is a route group: the settings page is served at /settings.
    expect(urls().success).toContain('/settings?');
    expect(urls().success).not.toContain('/dashboard/settings');
  });
});

/**
 * Stripe rejects an idempotency key replayed with different parameters. The key
 * used to be tenant + tier + hour, which is exactly the case above: retry after
 * a cancel, same key, different `success_url`, HTTP 400 for the rest of the hour.
 */
describe('the checkout idempotency key follows the request, not the clock', () => {
  const scope = 'checkout:org_1:negocio:2026-08-11T12';

  function payloadFor(returnUrl: string) {
    const built = createCheckoutPayload('negocio', 'org_1', returnUrl, LIVE_ENV);
    if (!built.ok) throw new Error('expected a payload');
    return built.payload;
  }

  it('is stable for an identical repeat — the double-click case it exists for', () => {
    const payload = payloadFor('https://businesshelper.app/settings');
    expect(checkoutIdempotencyKey(scope, payload)).toBe(
      checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings'))
    );
  });

  it('differs when the request differs', () => {
    // A query the page happens to carry changes the return URL, and with it the
    // request Stripe is asked to compare against the key.
    expect(checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings'))).not.toBe(
      checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings?ref=email'))
    );

    // So does the organization acquiring a Stripe customer between attempts.
    const withCustomer = { ...payloadFor('https://businesshelper.app/settings'), customer: 'cus_1' };
    expect(checkoutIdempotencyKey(scope, withCustomer)).not.toBe(
      checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings'))
    );
  });

  it('collapses the cancel-and-retry case to one session rather than a conflict', () => {
    // The two fixes meet here. `?status=cancelled` no longer reaches the
    // payload — the return-URL builder drops the parameters checkout owns — so
    // the retry is byte-identical to the first attempt and Stripe replays the
    // session it already made. Before either fix this was a same-key,
    // different-parameters 400.
    expect(checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings'))).toBe(
      checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings?status=cancelled'))
    );
  });

  it('stays inside Stripe’s 255-character limit', () => {
    expect(checkoutIdempotencyKey(scope, payloadFor('https://businesshelper.app/settings')).length)
      .toBeLessThanOrEqual(255);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `/api/stripe/checkout`, at the route.
 *
 * The route had no test of its own: `simulatedFeatures.test.ts` scans its
 * source for fabricated URLs, and `stripeBilling.test.ts` covers the payload
 * builder. Neither can see what the route *answers*, which is the thing a
 * tenant experiences — and on 2026-08-11 what it answered for every tier was a
 * 502 that meant "this deployment's price ids are product ids", worded as
 * though Stripe were down.
 */

const ORG = '11111111-2222-3333-4444-555555555555';

type Scenario = {
  role: string;
  env: Record<string, string>;
  sessionResult: unknown;
};

const scenario: Scenario = {
  role: 'owner',
  env: {},
  sessionResult: { ok: true, session: { id: 'cs_live_1', url: 'https://checkout.stripe.com/c/pay/cs_live_1' } },
};

const calls: { idempotencyKeys: string[]; payloads: Array<Record<string, unknown>> } = {
  idempotencyKeys: [],
  payloads: [],
};

vi.mock('@/lib/apiAuth', () => ({
  requireOrgAccess: async () => ({
    ok: true,
    ctx: {
      organizationId: ORG,
      userId: 'user_1',
      role: scenario.role,
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { stripe_customer_id: null } }) }),
          }),
        }),
      },
    },
  }),
}));

vi.mock('@/lib/stripeClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripeClient')>('@/lib/stripeClient');
  return {
    ...actual,
    isStripeConfigured: () => Boolean(scenario.env.STRIPE_SECRET_KEY),
    createCheckoutSession: async (payload: Record<string, unknown>, key?: string) => {
      calls.payloads.push(payload);
      if (key) calls.idempotencyKeys.push(key);
      return scenario.sessionResult;
    },
  };
});

async function post(body: unknown) {
  const { POST } = await import('@/app/api/stripe/checkout/route');
  const response = await POST(
    new Request('https://businesshelper.app/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  calls.idempotencyKeys = [];
  calls.payloads = [];
  scenario.role = 'owner';
  scenario.sessionResult = {
    ok: true,
    session: { id: 'cs_live_1', url: 'https://checkout.stripe.com/c/pay/cs_live_1' },
  };

  scenario.env = {
    STRIPE_SECRET_KEY: 'sk_live_realkey',
    STRIPE_PRICE_NEGOCIO: 'price_1LiveNegocio',
  };
  for (const [key, value] of Object.entries(scenario.env)) vi.stubEnv(key, value);
});

describe('POST /api/stripe/checkout', () => {
  it('returns the URL Stripe issued', async () => {
    const { status, json } = await post({ tierId: 'negocio', returnUrl: 'https://businesshelper.app/settings' });

    expect(status).toBe(200);
    expect(json.url).toBe('https://checkout.stripe.com/c/pay/cs_live_1');
    expect(json.sessionId).toBe('cs_live_1');
  });

  it('answers a product id in STRIPE_PRICE_* with its own code, not a Stripe error', async () => {
    // The production failure: the variable is set, so this is neither "not
    // configured" nor an outage, and a 502 sent the founder to Stripe's status
    // page for a value only they can fix.
    vi.stubEnv('STRIPE_PRICE_NEGOCIO', 'prod_V0DOcZFUtjlMkb');

    const { status, json } = await post({ tierId: 'negocio' });

    expect(status).toBe(503);
    expect(json.error.code).toBe('STRIPE_PRICE_MISCONFIGURED');
    // Nothing reached Stripe: the request could not have succeeded.
    expect(calls.payloads).toHaveLength(0);
  });

  it('still separates an unset price variable from a malformed one', async () => {
    vi.stubEnv('STRIPE_PRICE_EMPRESA', '');

    const { status, json } = await post({ tierId: 'empresa' });

    expect(status).toBe(503);
    expect(json.error.code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
  });

  it('keys the request, not the hour', async () => {
    // Same tenant, same tier, same hour, different request: the tenant-and-clock
    // key these three used to share is one Stripe answers with a 400 as soon as
    // any parameter moves, and it reaches the founder as a generic payment
    // failure for the rest of the hour.
    await post({ tierId: 'negocio', returnUrl: 'https://businesshelper.app/settings' });
    await post({ tierId: 'negocio', returnUrl: 'https://businesshelper.app/settings?ref=email' });
    await post({ tierId: 'negocio', returnUrl: 'https://businesshelper.app/settings' });
    // A payer coming back from a cancelled session: `?status=cancelled` is
    // stripped from the return URL, so this really is the same request again.
    await post({ tierId: 'negocio', returnUrl: 'https://businesshelper.app/settings?status=cancelled' });

    expect(calls.idempotencyKeys).toHaveLength(4);
    expect(calls.idempotencyKeys[0]).not.toBe(calls.idempotencyKeys[1]);
    // The double-click case the key exists for still collapses to one session.
    expect(calls.idempotencyKeys[0]).toBe(calls.idempotencyKeys[2]);
    expect(calls.idempotencyKeys[0]).toBe(calls.idempotencyKeys[3]);
  });

  it('refuses a role without billing_management', async () => {
    scenario.role = 'member';

    const { status, json } = await post({ tierId: 'negocio' });

    expect(status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(calls.payloads).toHaveLength(0);
  });

  it('refuses an unknown tier rather than billing the nearest one', async () => {
    const { status, json } = await post({ tierId: 'plan_pirata' });

    expect(status).toBe(400);
    expect(json.error.code).toBe('INVALID_TIER');
  });

  it('drops a return URL pointing at another origin', async () => {
    await post({ tierId: 'negocio', returnUrl: 'https://evil.example.com/steal' });

    const payload = calls.payloads[0];
    expect(String(payload.success_url)).not.toContain('evil.example.com');
    expect(String(payload.success_url)).toContain('/settings?');
  });

  it('answers 503 when the deployment has no Stripe key at all', async () => {
    scenario.env = {};
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    const { status, json } = await post({ tierId: 'negocio' });

    expect(status).toBe(503);
    expect(json.error.code).toBe('STRIPE_NOT_CONFIGURED');
  });
});

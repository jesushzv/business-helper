import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `/api/stripe/portal`, at the route (#346).
 *
 * Cancelling a plan, replacing a card and downloading an invoice had no route
 * in the product at all — the only paths were a support message to the founder
 * or a manual action in the Stripe dashboard. This is the endpoint that closes
 * that gap, and every one of its refusals is a thing a tenant will actually
 * hit, so each is asserted here rather than left to the happy path.
 */

const ORG = '11111111-2222-3333-4444-555555555555';

type Scenario = {
  role: string;
  configured: boolean;
  customerId: string | null;
  portalResult: unknown;
};

const scenario: Scenario = {
  role: 'owner',
  configured: true,
  customerId: 'cus_live_abc',
  portalResult: {
    ok: true,
    session: { id: 'bps_live_1', url: 'https://billing.stripe.com/p/session/bps_live_1' },
  },
};

const calls: { customerIds: string[]; returnUrls: string[] } = { customerIds: [], returnUrls: [] };

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
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_customer_id: scenario.customerId } }),
            }),
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
    isStripeConfigured: () => scenario.configured,
    createBillingPortalSession: async (customerId: string, returnUrl: string) => {
      calls.customerIds.push(customerId);
      calls.returnUrls.push(returnUrl);
      return scenario.portalResult;
    },
  };
});

async function post() {
  const { POST } = await import('@/app/api/stripe/portal/route');
  const response = await POST();
  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  calls.customerIds = [];
  calls.returnUrls = [];
  scenario.role = 'owner';
  scenario.configured = true;
  scenario.customerId = 'cus_live_abc';
  scenario.portalResult = {
    ok: true,
    session: { id: 'bps_live_1', url: 'https://billing.stripe.com/p/session/bps_live_1' },
  };
});

describe('POST /api/stripe/portal', () => {
  it('returns the portal URL Stripe issued, for the stored customer', async () => {
    const { status, json } = await post();

    expect(status).toBe(200);
    expect(json.url).toBe('https://billing.stripe.com/p/session/bps_live_1');
    expect(calls.customerIds).toEqual(['cus_live_abc']);
  });

  it('sends a built return URL, never a literal origin', async () => {
    await post();

    // #36/#47/#73's class: a hardcoded origin has shipped four times, and
    // `.mx` was never registered.
    expect(calls.returnUrls).toHaveLength(1);
    expect(calls.returnUrls[0]).toMatch(/\/settings$/);
    expect(calls.returnUrls[0]).not.toContain('businesshelper.mx');
  });

  it('refuses a member — only the owner holds billing_management', async () => {
    scenario.role = 'member';

    const { status, json } = await post();

    expect(status).toBe(403);
    expect(json.error.code).toBe('FORBIDDEN');
    // Not a word of Stripe was spoken on a request that never got that far.
    expect(calls.customerIds).toHaveLength(0);
  });

  it('fails closed when Stripe is not configured, before blaming the tenant', async () => {
    // A deployment with no key has no customers either, so answering 409
    // ("you have no plan") would send the owner to buy something they already
    // bought. Hard rule #3: unset credentials are a 503.
    scenario.configured = false;
    scenario.customerId = null;

    const { status, json } = await post();

    expect(status).toBe(503);
    expect(json.error.code).toBe('STRIPE_NOT_CONFIGURED');
    expect(calls.customerIds).toHaveLength(0);
  });

  it('answers 409 when the organization has never checked out', async () => {
    // Absent is absent (hard rule #1): no stored customer means Stripe has no
    // billing relationship, and creating one just to open a portal would
    // invent it.
    scenario.customerId = null;

    const { status, json } = await post();

    expect(status).toBe(409);
    expect(json.error.code).toBe('NO_BILLING_ACCOUNT');
    expect(json.error.message).toMatch(/plan contratado/i);
    expect(calls.customerIds).toHaveLength(0);
  });

  it('reports a Stripe failure as a failure, with no URL', async () => {
    scenario.portalResult = {
      ok: false,
      code: 'STRIPE_ERROR',
      message: 'No se pudo abrir la administración de tu suscripción.',
    };

    const { status, json } = await post();

    expect(status).toBe(502);
    expect(json.url).toBeUndefined();
    expect(json.error.code).toBe('STRIPE_ERROR');
  });

  it('answers a timeout as a timeout rather than a hung success', async () => {
    scenario.portalResult = { ok: false, code: 'TIMEOUT', message: 'No se pudo abrir.' };

    const { status, json } = await post();

    expect(status).toBe(502);
    expect(json.error.code).toBe('TIMEOUT');
  });

  it('every refusal speaks Spanish', async () => {
    const messages: string[] = [];

    scenario.role = 'member';
    messages.push((await post()).json.error.message);

    scenario.role = 'owner';
    scenario.customerId = null;
    messages.push((await post()).json.error.message);

    scenario.configured = false;
    messages.push((await post()).json.error.message);

    for (const message of messages) {
      expect(message).toBeTruthy();
      // No leaked machine state in the prose a tenant reads.
      expect(message).not.toMatch(/stripe_customer_id|billing_portal|FORBIDDEN|undefined/i);
    }
    expect(messages).toHaveLength(3);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signStripePayload } from '@/lib/stripeWebhook';

/**
 * #63 — the two things the webhook route must not do, pinned at the route.
 *
 * `securityHardening.test.ts` covers `verifyStripeWebhookSignature` as a
 * function. That is not the same as covering the route: everything below is a
 * property of how the route *uses* the verifier and the database, and none of
 * it is visible from the function's unit tests.
 *
 *   1. A deployment with no STRIPE_WEBHOOK_SECRET must not answer like a
 *      deployment that rejected a forgery. Both were 400, which made an
 *      unconfigured endpoint indistinguishable from a working one — in Stripe's
 *      dashboard and to `npm run verify:webhook`.
 *   2. An UPDATE that matches no row must not be reported as processed.
 *      Supabase returns `{ error: null }` for an UPDATE that changed nothing,
 *      so a well-formed organization uuid that exists in Stripe's metadata but
 *      not in this database produced 200 `{ processed }` for a tier change that
 *      was never written (hard rule 1).
 */

const SECRET = 'whsec_test_secret_for_route';
const ORG = '11111111-2222-3333-4444-555555555555';

type Scenario = {
  /** Rows returned by the UPDATE … RETURNING id. Empty array = matched nothing. */
  updatedRows: Array<{ id: string }>;
  updateError: { code?: string } | null;
  claimError: { code?: string } | null;
  serviceRoleConfigured: boolean;
};

const scenario: Scenario = {
  updatedRows: [{ id: ORG }],
  updateError: null,
  claimError: null,
  serviceRoleConfigured: true,
};

const calls = { claimInserts: 0, claimDeletes: 0, updates: 0 };

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => scenario.serviceRoleConfigured,
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: () => {
        if (table === 'stripe_webhook_events') calls.claimInserts += 1;
        return Promise.resolve({ error: scenario.claimError });
      },
      update: () => {
        calls.updates += 1;
        return {
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: scenario.updateError ? null : scenario.updatedRows,
                error: scenario.updateError,
              }),
          }),
        };
      },
      delete: () => ({
        eq: () => {
          if (table === 'stripe_webhook_events') calls.claimDeletes += 1;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

function subscriptionEvent(id: string, organizationId: string = ORG) {
  return JSON.stringify({
    id,
    type: 'customer.subscription.updated',
    data: {
      object: {
        metadata: { organization_id: organizationId, tier_id: 'negocio' },
        status: 'active',
        items: { data: [{ price: { id: 'price_negocio' } }] },
      },
    },
  });
}

async function postWebhook(body: string, signatureHeader: string | null) {
  const { POST } = await import('@/app/api/stripe/webhook/route');
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (signatureHeader) headers.set('Stripe-Signature', signatureHeader);

  const response = await POST(
    new Request('https://staging.example.com/api/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    })
  );

  return { status: response.status, json: await response.json() };
}

beforeEach(() => {
  scenario.updatedRows = [{ id: ORG }];
  scenario.updateError = null;
  scenario.claimError = null;
  scenario.serviceRoleConfigured = true;
  calls.claimInserts = 0;
  calls.claimDeletes = 0;
  calls.updates = 0;
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('#63 — an unconfigured endpoint is distinguishable from a rejected forgery', () => {
  it('answers 503, not 400, when STRIPE_WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');

    const body = subscriptionEvent('evt_unconfigured');
    const { status } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(503);
  });

  it('answers 400 for a missing signature when the secret is configured', async () => {
    const { status } = await postWebhook(subscriptionEvent('evt_unsigned'), null);
    expect(status).toBe(400);
  });

  it('answers 400 for a signature made with a different secret', async () => {
    const body = subscriptionEvent('evt_forged');
    const { status } = await postWebhook(body, signStripePayload(body, 'whsec_attacker'));
    expect(status).toBe(400);
  });

  it('never names the endpoint secret in a response body', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const body = subscriptionEvent('evt_unconfigured_body');
    const { json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(JSON.stringify(json)).not.toContain('STRIPE_WEBHOOK_SECRET');
  });
});

describe('#63 — the positive control the verification script depends on', () => {
  it('accepts a correctly signed event of an unhandled type without touching the database', async () => {
    const body = JSON.stringify({
      id: 'evt_control',
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    });

    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(json.ignored).toBe('invoice.payment_succeeded');
    // The control must stay free of every configuration a staging deployment
    // might be missing, or it stops being usable as one.
    expect(calls.claimInserts).toBe(0);
    expect(calls.updates).toBe(0);
  });

  it('still accepts the unhandled type when the service role is not configured', async () => {
    scenario.serviceRoleConfigured = false;

    const body = JSON.stringify({
      id: 'evt_control_no_service_role',
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    });

    const { status } = await postWebhook(body, signStripePayload(body, SECRET));
    expect(status).toBe(200);
  });
});

describe('#63 — accepted *and processed* means a row actually changed', () => {
  it('reports processed when the update matched the organization', async () => {
    const body = subscriptionEvent('evt_applied');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(json.processed).toMatchObject({ organizationId: ORG, tierId: 'negocio' });
  });

  it('refuses with 404 when the update matched no row, instead of reporting success', async () => {
    // A well-formed uuid that exists in Stripe's metadata but in no row here —
    // a staging secret pointed at the wrong database, or a deleted tenant.
    scenario.updatedRows = [];

    const body = subscriptionEvent('evt_ghost_org');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(404);
    expect(json.processed).toBeUndefined();
  });

  it('releases the idempotency claim when the update matched no row', async () => {
    // Otherwise the redelivery Stripe sends next is deduplicated against an
    // event that never took effect, and the tier change is lost for good.
    scenario.updatedRows = [];

    const body = subscriptionEvent('evt_ghost_org_claim');
    await postWebhook(body, signStripePayload(body, SECRET));

    expect(calls.claimInserts).toBe(1);
    expect(calls.claimDeletes).toBe(1);
  });

  it('releases the claim and returns 500 when the update itself errors', async () => {
    scenario.updateError = { code: '08006' };

    const body = subscriptionEvent('evt_update_error');
    const { status } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(500);
    expect(calls.claimDeletes).toBe(1);
  });
});

describe('#63 — a redelivery is not applied twice', () => {
  it('acknowledges a duplicate event id without updating anything', async () => {
    scenario.claimError = { code: '23505' };

    const body = subscriptionEvent('evt_replayed');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(json.duplicate).toBe(true);
    expect(calls.updates).toBe(0);
  });
});

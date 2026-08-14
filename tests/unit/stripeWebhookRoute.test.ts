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
 *      so the route would answer 200 `{ processed }` for a tier change never
 *      written (hard rule 1). Scope, stated honestly: the obvious path — a
 *      well-formed uuid belonging to no row here — is already closed by the FK
 *      on `stripe_webhook_events.organization_id` (verified live 2026-08-09),
 *      which fails the claim insert first. What remains is the deletion race,
 *      where `ON DELETE SET NULL` leaves the claim standing. These cases drive
 *      the branch directly rather than reproducing that race.
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
/** The column values the route actually wrote (#128). */
const updateValues: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => scenario.serviceRoleConfigured,
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: () => {
        if (table === 'stripe_webhook_events') calls.claimInserts += 1;
        return Promise.resolve({ error: scenario.claimError });
      },
      update: (values: Record<string, unknown>) => {
        calls.updates += 1;
        updateValues.push(values);
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
  updateValues.length = 0;
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
    // The organization was deleted after the claim insert succeeded; the FK is
    // ON DELETE SET NULL, so the ledger row survives and the UPDATE matches
    // nothing.
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

/**
 * #325 — the one route grandfathered out of the #275 envelope gate.
 *
 * These bodies are read by Stripe's webhook log, never by a tenant UI, so the
 * audience-facing harm #275 fixed does not apply. What does apply: whoever is
 * reading that log at 2am wants a machine-readable `code` next to the Spanish
 * sentence, and the repo having exactly one envelope shape is worth more than
 * this route's exemption from it.
 *
 * The conversion broke no test in the suite, which is precisely why these
 * exist — the shape was unasserted, so nothing would have noticed it drifting
 * back.
 */
describe('#325 — every error body is the { code, message } envelope', () => {
  const envelope = (json: Record<string, unknown>) => json.error as { code?: string; message?: string };

  it('answers a code and a Spanish message when the endpoint has no secret', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const body = subscriptionEvent('evt_no_secret_envelope');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(503);
    expect(envelope(json).code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(envelope(json).message).toMatch(/no configurada/i);
    // The whole point: not a bare string under the error key.
    expect(typeof json.error).toBe('object');
  });

  it('distinguishes a forged signature from a malformed payload by code', async () => {
    const forged = await postWebhook(subscriptionEvent('evt_forged_envelope'), null);
    expect(forged.status).toBe(400);
    expect(envelope(forged.json).code).toBe('INVALID_SIGNATURE');

    const notJson = 'this is not json';
    const malformed = await postWebhook(notJson, signStripePayload(notJson, SECRET));
    expect(malformed.status).toBe(400);
    expect(envelope(malformed.json).code).toBe('INVALID_PAYLOAD');
  });

  it('names the storage gap rather than the caller when the service role is missing', async () => {
    scenario.serviceRoleConfigured = false;
    const body = subscriptionEvent('evt_no_service_role');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(503);
    // The same code the eight other service-role branches answer with.
    expect(envelope(json).code).toBe('BACKEND_NOT_CONFIGURED');
  });

  it('separates an unusable organization id from an organization that is not here', async () => {
    const noOrg = JSON.stringify({
      id: 'evt_no_org',
      type: 'customer.subscription.updated',
      data: { object: { status: 'active', items: { data: [] } } },
    });
    const first = await postWebhook(noOrg, signStripePayload(noOrg, SECRET));
    expect(first.status).toBe(400);
    expect(envelope(first.json).code).toBe('ORGANIZATION_MISSING');

    scenario.updatedRows = [];
    const ghost = subscriptionEvent('evt_ghost_envelope');
    const second = await postWebhook(ghost, signStripePayload(ghost, SECRET));
    expect(second.status).toBe(404);
    expect(envelope(second.json).code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('names the failed write when the subscription change could not be applied', async () => {
    scenario.updateError = { code: '08006' };
    const body = subscriptionEvent('evt_update_envelope');
    const { status, json } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(500);
    expect(envelope(json).code).toBe('SUBSCRIPTION_UPDATE_FAILED');
    expect(envelope(json).message).toMatch(/suscripción/i);
  });

  it('leaves the success bodies alone — Stripe branches on these', async () => {
    const ignored = JSON.stringify({
      id: 'evt_ignored_envelope',
      type: 'invoice.payment_succeeded',
      data: { object: {} },
    });
    const { status, json } = await postWebhook(ignored, signStripePayload(ignored, SECRET));

    expect(status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.ignored).toBe('invoice.payment_succeeded');
    expect(json.error).toBeUndefined();
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

/** A subscription event carrying a chosen status, or none at all. */
function statusEvent(id: string, status: string | null) {
  const object: Record<string, unknown> = {
    metadata: { organization_id: ORG, tier_id: 'negocio' },
    items: { data: [{ price: { id: 'price_negocio' } }] },
  };
  if (status) object.status = status;
  return JSON.stringify({
    id,
    type: 'customer.subscription.updated',
    data: { object },
  });
}

describe('the app-side trial ends when Stripe takes over (#128)', () => {
  it('clears trial_ends_at whenever a subscription status is written', async () => {
    const body = statusEvent('evt_trial_clear_active', 'active');
    const { status } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(updateValues[0]).toHaveProperty('subscription_status', 'active');
    expect(updateValues[0]).toHaveProperty('trial_ends_at', null);
  });

  it('clears it for a Stripe-reported trialing status too', async () => {
    // The one that matters. Stripe reports `trialing` for a subscription inside
    // *its own* trial window, and resolveTrialState consults `trial_ends_at`
    // while the status is that. An app-side date surviving here would refuse a
    // quote to a customer who had just subscribed, because a trial they
    // replaced by paying had lapsed — blocking on a fact no longer held.
    const body = statusEvent('evt_trial_clear_trialing', 'trialing');
    const { status } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(updateValues[0]).toHaveProperty('trial_ends_at', null);
  });

  it('does not touch the trial when the event establishes no status', async () => {
    // An event that establishes nothing must not end a trial on its way past —
    // the same rule the route already applies to subscription_status itself.
    const body = statusEvent('evt_trial_untouched', null);
    const { status } = await postWebhook(body, signStripePayload(body, SECRET));

    expect(status).toBe(200);
    expect(updateValues[0]).not.toHaveProperty('subscription_status');
    expect(updateValues[0]).not.toHaveProperty('trial_ends_at');
  });
});

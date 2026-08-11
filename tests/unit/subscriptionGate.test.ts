import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireActiveSubscription } from '@/lib/apiAuth';
import { trialEndsAtFrom } from '@/lib/subscriptionAccess';

/**
 * #128 — the server half of the trial gate.
 *
 * `useSubscriptionAccess` disables buttons; this is what actually refuses. The
 * client being permissive on unknown is only safe because this exists, so the
 * two halves are tested against the same cases from opposite directions.
 *
 * The 402 is deliberate — the same code `FOLIOS_EXHAUSTED` uses. A 403 would
 * send the tenant to a permissions message; this is "payment required", and the
 * client branches on `error.code` to open billing.
 */

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createClient: async () => ({}),
}));

let row: { subscription_status: string | null; trial_ends_at: string | null } | null = null;
let readError: unknown = null;

function ctx() {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    role: 'owner' as const,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: readError }),
          }),
        }),
      }),
    },
  };
}

beforeEach(() => {
  row = null;
  readError = null;
});

describe('the gate lets work through', () => {
  it('returns null for an active subscription', async () => {
    row = { subscription_status: 'active', trial_ends_at: null };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });

  it('returns null inside a live trial', async () => {
    row = { subscription_status: 'trialing', trial_ends_at: trialEndsAtFrom(new Date()) };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });

  it('returns null while Stripe retries a failed card', async () => {
    row = { subscription_status: 'past_due', trial_ends_at: null };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });
});

describe('the gate refuses an expired trial', () => {
  it('answers 402 with the SUBSCRIPTION_REQUIRED envelope', async () => {
    row = { subscription_status: 'trialing', trial_ends_at: '2020-01-01T00:00:00.000Z' };

    const res = await requireActiveSubscription(ctx());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);

    const body = await res!.json();
    expect(body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(body.error.state).toBe('trial_expired');
    // Spanish, safe to render, and it names what still works.
    expect(body.error.message).toMatch(/prueba gratis/i);
    expect(body.error.message).toMatch(/cobrando/i);
  });

  it('refuses a cancelled subscription too', async () => {
    row = { subscription_status: 'canceled', trial_ends_at: null };

    const res = await requireActiveSubscription(ctx());
    expect(res!.status).toBe(402);
    expect((await res!.json()).error.state).toBe('inactive');
  });
});

describe('an outage is not a billing wall', () => {
  /**
   * The direction that matters most. A gate that fails closed turns any
   * database blip into "tu prueba terminó" for every tenant at once, including
   * the ones who have paid — and the copy would be a lie the system had no
   * basis for. Failing open costs, at worst, a free afternoon.
   */
  it('lets the write through when the read errors', async () => {
    readError = { code: '57014', message: 'canceling statement due to statement timeout' };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });

  it('lets the write through when the row is missing', async () => {
    row = null;
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });

  it('lets the write through for a status this code does not know', async () => {
    row = { subscription_status: 'paused_by_stripe_2027', trial_ends_at: null };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });

  it('lets the write through for trialing with no end date', async () => {
    // Also the shape a Stripe-side trial leaves once the webhook nulls
    // trial_ends_at — a genuinely subscribed customer must not be refused.
    row = { subscription_status: 'trialing', trial_ends_at: null };
    expect(await requireActiveSubscription(ctx())).toBeNull();
  });
});

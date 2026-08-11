import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  evaluateSubscriptionAccess,
  trialEndsAtFrom,
  TRIAL_PERIOD_DAYS,
} from '@/lib/subscriptionAccess';
import { subscriptionAllowsWrite } from '@/lib/hooks/useSubscriptionAccess';

/**
 * #128 — a 30-day trial, then read-only until a plan is bought.
 *
 * Before this the product was free with metered CFDI and nothing said so:
 * `subscription_tier` defaulted to a `'free'` tier `STRIPE_PLANS` never
 * contained, `subscription_status` to `'active'`, and the `isAccessible` flag
 * `validateSubscriptionStatus` computed was read by nothing.
 *
 * The danger in adding a gate is the inverse of this repo's usual defect: not
 * claiming a success the system has not earned, but claiming a *failure* it has
 * not established — refusing a paying tenant on the strength of a bad read.
 * Most of what follows pins the permissive direction.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');

function at(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('a live trial permits everything', () => {
  it('allows writes and stays quiet early in the trial', () => {
    const a = evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(20), now: NOW });

    expect(a.state).toBe('trialing');
    expect(a.canWrite).toBe(true);
    expect(a.trialDaysRemaining).toBe(20);
    // A countdown from day 30 is nagging, not information — and a banner the
    // tenant learns to scroll past is worse than none when the real one lands.
    expect(a.message).toBeNull();
  });

  it('starts warning in the last week, naming the days left', () => {
    const a = evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(5), now: NOW });

    expect(a.canWrite).toBe(true);
    expect(a.trialDaysRemaining).toBe(5);
    expect(a.message).toContain('5 días');
  });

  it('says "mañana" rather than "1 días" on the final day', () => {
    const a = evaluateSubscriptionAccess({
      status: 'trialing',
      trialEndsAt: at(0.5),
      now: NOW,
    });

    expect(a.trialDaysRemaining).toBe(1);
    expect(a.message).toContain('mañana');
    expect(a.message).not.toContain('1 días');
  });
});

describe('an expired trial blocks writes only', () => {
  it('refuses writes once the end date has passed', () => {
    const a = evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(-1), now: NOW });

    expect(a.state).toBe('trial_expired');
    expect(a.canWrite).toBe(false);
    expect(a.trialDaysRemaining).toBe(0);
  });

  it('tells the tenant what still works, in Mexican Spanish', () => {
    const a = evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(-1), now: NOW });

    // Their first fear is that signed contracts and money owed have become
    // unreachable. They have not, and saying so is what separates a paywall
    // from an eviction notice.
    expect(a.message).toMatch(/consultando/i);
    expect(a.message).toMatch(/cobrando/i);
    // Plain language, no developer jargon (hard rule 8).
    expect(a.message).not.toMatch(/subscription|trial_ends_at|status|RLS/i);
  });

  it('never reports a negative day count', () => {
    const a = evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(-400), now: NOW });
    expect(a.trialDaysRemaining).toBe(0);
  });
});

describe('unknown never blocks — the rule that protects a paying tenant', () => {
  /**
   * Each of these is a state the system cannot interpret. Every one resolves to
   * full access and reports `unknown`, so a caller can tell it apart from a
   * genuine `active`. Failing closed here would lock a tenant out of their own
   * receivables over a blip; failing open costs, at worst, a free afternoon.
   */
  const cases: Array<[string, Parameters<typeof evaluateSubscriptionAccess>[0]]> = [
    ['a null status (read failed)', { status: null, trialEndsAt: null, now: NOW }],
    ['an undefined status', { status: undefined, trialEndsAt: null, now: NOW }],
    ['an empty status', { status: '', trialEndsAt: null, now: NOW }],
    [
      'a status the CHECK has grown that this code has not',
      { status: 'paused_by_stripe_2027', trialEndsAt: null, now: NOW },
    ],
    [
      'trialing with no end date (a half-written row)',
      { status: 'trialing', trialEndsAt: null, now: NOW },
    ],
    [
      'trialing with an unparseable end date',
      { status: 'trialing', trialEndsAt: 'el mes que entra', now: NOW },
    ],
    [
      'incomplete — a checkout started and not finished',
      { status: 'incomplete', trialEndsAt: at(-5), now: NOW },
    ],
  ];

  for (const [label, input] of cases) {
    it(`grants access for ${label}`, () => {
      const a = evaluateSubscriptionAccess(input);
      expect(a.canWrite).toBe(true);
      expect(a.state).toBe('unknown');
    });
  }

  it('does not map an unrecognised status to the nearest one it knows (#95)', () => {
    // #95: a TS union narrower than the column mapped 'free' to 'inicial' and
    // showed a $299 plan nobody had bought, with its own subscribe button
    // disabled. An unrecognised value tells us nothing; `unknown` says so.
    const a = evaluateSubscriptionAccess({ status: 'free', trialEndsAt: null, now: NOW });
    expect(a.state).toBe('unknown');
    expect(a.state).not.toBe('inactive');
    expect(a.state).not.toBe('trial_expired');
  });
});

describe('paid and lapsed states', () => {
  it('grants access to an active subscription with nothing to say', () => {
    const a = evaluateSubscriptionAccess({ status: 'active', trialEndsAt: null, now: NOW });
    expect(a).toMatchObject({ state: 'active', canWrite: true, message: null });
  });

  it('ignores a stale trial date on an active subscription', () => {
    // The webhook nulls this, but a row mid-migration may still carry one. A
    // customer who paid must not be refused by a trial they replaced.
    const a = evaluateSubscriptionAccess({ status: 'active', trialEndsAt: at(-90), now: NOW });
    expect(a.canWrite).toBe(true);
  });

  it('keeps a past_due customer working while Stripe retries the card', () => {
    const a = evaluateSubscriptionAccess({ status: 'past_due', trialEndsAt: null, now: NOW });
    expect(a.canWrite).toBe(true);
    expect(a.state).toBe('past_due');
    expect(a.message).toMatch(/pago/i);
  });

  it('blocks writes for canceled, unpaid and incomplete_expired', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
      const a = evaluateSubscriptionAccess({ status, trialEndsAt: null, now: NOW });
      expect(a.canWrite, status).toBe(false);
      expect(a.state, status).toBe('inactive');
    }
  });

  it('reads the status case-insensitively', () => {
    expect(evaluateSubscriptionAccess({ status: 'ACTIVE', trialEndsAt: null, now: NOW }).state)
      .toBe('active');
  });
});

describe('trialEndsAtFrom', () => {
  it('is exactly the configured period ahead', () => {
    const end = new Date(trialEndsAtFrom(NOW));
    const days = (end.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(TRIAL_PERIOD_DAYS);
  });

  it('produces a date the evaluator then treats as a live trial', () => {
    const a = evaluateSubscriptionAccess({
      status: 'trialing',
      trialEndsAt: trialEndsAtFrom(NOW),
      now: NOW,
    });
    expect(a.canWrite).toBe(true);
    expect(a.trialDaysRemaining).toBe(TRIAL_PERIOD_DAYS);
  });
});

describe('the migration and the code agree on the trial length', () => {
  it('matches the column default in 20260811170000', () => {
    // The column default cannot read TRIAL_PERIOD_DAYS, so the number is
    // written twice. This is the gate that stops the two drifting — a doc's
    // content being load-bearing for correctness needs a test (#135).
    const sql = readFileSync(
      'supabase/migrations/20260811170000_subscription_trials.sql',
      'utf8'
    );
    const match = /interval\s+'(\d+)\s+days'/.exec(sql);
    expect(match, 'no interval literal found in the migration').toBeTruthy();
    expect(Number(match![1])).toBe(TRIAL_PERIOD_DAYS);
  });
});

describe('subscriptionAllowsWrite makes the permissive default explicit', () => {
  it('permits a write when the state is unknown', () => {
    // `access?.canWrite` would be `undefined` here — falsy — and would disable
    // the whole UI on a network blip. That inversion is what this exists to
    // stop, so it gets its own assertion.
    expect(subscriptionAllowsWrite(null)).toBe(true);
  });

  it('passes through a known answer unchanged', () => {
    expect(
      subscriptionAllowsWrite(
        evaluateSubscriptionAccess({ status: 'trialing', trialEndsAt: at(-1), now: NOW })
      )
    ).toBe(false);
    expect(
      subscriptionAllowsWrite(
        evaluateSubscriptionAccess({ status: 'active', trialEndsAt: null, now: NOW })
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scanning gate: the trial must never reach a tenant's client.
// ---------------------------------------------------------------------------

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, acc);
    else if (entry === 'route.ts') acc.push(full);
  }
  return acc;
}

describe('a supplier’s billing never blocks their customer (#128)', () => {
  const apiRoutes = routeFiles('app/api');
  const publicRoutes = apiRoutes.filter((f) => f.includes('/public/'));

  it('finds the public routes it is meant to be scanning', () => {
    // An assertion of absence that matches nothing passes for the wrong reason.
    expect(publicRoutes.length).toBeGreaterThanOrEqual(3);
  });

  it('no public route imports the subscription gate or the evaluator', () => {
    // `/q/[token]` and `/pay/[token]` are the pages a *buyer* opens to sign and
    // to pay. They carry no session and must never consult the seller's billing
    // state: money already in flight has to keep flowing, and a client halfway
    // through an OTP signature is not the person who owes us $299.
    const offenders = publicRoutes.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        /requireActiveSubscription/.test(source) ||
        /from '@\/lib\/subscriptionAccess'/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });

  it('gates exactly the routes that create new commercial work', () => {
    const gated = apiRoutes
      .filter((f) => /requireActiveSubscription/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(/\\/g, '/'))
      .sort();

    // Re-derived from the tree rather than trusted: if a new write route is
    // added and should be gated, this list is where the decision gets recorded.
    expect(gated).toEqual([
      'app/api/invoices/[id]/complement/route.ts',
      'app/api/invoices/issue/route.ts',
      'app/api/quotes/[id]/convert/route.ts',
      'app/api/quotes/route.ts',
      'app/api/whatsapp/broadcast/route.ts',
    ]);
  });

  it('leaves collection and billing paths ungated', () => {
    // Collecting what is already owed must never stop, and the Stripe routes
    // are how a blocked tenant gets *out* of the blocked state — gating either
    // would be a trap with no exit.
    const mustNotGate = [
      'app/api/receivables/[id]/confirm/route.ts',
      'app/api/receivables/[id]/upload/route.ts',
      'app/api/invoices/[id]/cancel/route.ts',
      'app/api/stripe/checkout/route.ts',
      'app/api/organization/route.ts',
    ];

    for (const file of mustNotGate) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/requireActiveSubscription/);
    }
  });
});

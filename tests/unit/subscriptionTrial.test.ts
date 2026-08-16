import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveTrialState,
  trialEndsAt,
  TRIAL_DAYS,
  TRIAL_EXPIRED_CODE,
} from '@/lib/subscriptionTrial';

/**
 * #128 — what an organization that has never subscribed actually gets.
 *
 * `subscription_tier` defaulted to `'free'`, a plan in no price list;
 * `subscription_status` to `'active'`; and nothing in the app read either. The
 * decision is a time-boxed trial, and the two things that decide whether it is
 * honest are both here:
 *
 *  - **unknown never gates.** A read that failed, a row with no trial recorded,
 *    a status this code does not model — each answers "unknown" and lets the
 *    tenant work. The gate exists to create a commercial forcing function, not
 *    to protect anything, so wrongly refusing costs far more than wrongly
 *    allowing (#64's tri-state, with the permissive branch chosen on purpose).
 *  - **it does not fire where nobody can pay.** #68 is open: no checkout works
 *    yet, and a paywall with no way through is a dead end.
 */

const NOW = new Date('2026-08-11T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

/**
 * The same offset, but from the **real** clock.
 *
 * `inDays` is anchored to the frozen `NOW` above, which is right for
 * `resolveTrialState` — those cases pass `now: NOW` in, so both sides of the
 * comparison are pinned. It is wrong for the route-level cases below: they call
 * `POST /api/quotes` for real, and the route reads `new Date()`. A fixture
 * saying "the trial ends 5 days after 2026-08-11" therefore stopped meaning
 * "the trial is live" at 12:00 UTC on 2026-08-16, and this file went red then
 * and would have stayed red — the same time-bomb shape as the due-today fixture
 * in `aiAssistant.test.ts` (#334), which was green every morning and red every
 * evening.
 */
const fromRealNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const paying = { checkoutAvailable: true, now: NOW };

describe('resolveTrialState', () => {
  it('counts the days left inside the window', () => {
    const state = resolveTrialState(
      { subscription_status: 'trialing', trial_ends_at: inDays(9.5) },
      paying
    );
    expect(state.kind).toBe('trialing');
    expect(state.daysLeft).toBe(10);
    expect(state.blocksNewWork).toBe(false);
  });

  it('gates new work once the end date has passed', () => {
    const state = resolveTrialState(
      { subscription_status: 'trialing', trial_ends_at: inDays(-1) },
      paying
    );
    expect(state.kind).toBe('expired');
    expect(state.blocksNewWork).toBe(true);
  });

  it('does not gate an expired trial where no checkout exists (#68)', () => {
    const state = resolveTrialState(
      { subscription_status: 'trialing', trial_ends_at: inDays(-30) },
      { now: NOW, checkoutAvailable: false }
    );
    // Still honestly reported as expired — the tenant is told. It just cannot
    // take the product away when there is no way to pay for it.
    expect(state.kind).toBe('expired');
    expect(state.blocksNewWork).toBe(false);
    expect(state.gateEnforced).toBe(false);
  });

  it('lets a real subscription outrank a stale trial date', () => {
    // The Stripe webhook is the only writer of subscription_status, and it must
    // win: a subscriber whose trial_ends_at was never cleared is not expired.
    const state = resolveTrialState(
      { subscription_status: 'active', subscription_tier: 'negocio', trial_ends_at: inDays(-90) },
      paying
    );
    expect(state.kind).toBe('subscribed');
    expect(state.blocksNewWork).toBe(false);
  });

  it('leaves past_due to Stripe rather than adding a second opinion', () => {
    const state = resolveTrialState({ subscription_status: 'past_due' }, paying);
    expect(state.kind).toBe('past_due');
    expect(state.blocksNewWork).toBe(false);
  });

  describe('unknown never gates', () => {
    const cases: Array<[string, unknown]> = [
      ['a row that could not be read', null],
      ['trialing with no end date', { subscription_status: 'trialing', trial_ends_at: null }],
      ['an unparseable end date', { subscription_status: 'trialing', trial_ends_at: 'mañana' }],
      ['a status this code does not model', { subscription_status: 'incomplete_expired' }],
      ['an empty row', {}],
    ];

    for (const [name, row] of cases) {
      it(name, () => {
        const state = resolveTrialState(row as never, paying);
        expect(state.kind).toBe('unknown');
        expect(state.blocksNewWork).toBe(false);
      });
    }
  });
});

describe('trialEndsAt', () => {
  it('is 14 days out — the number marketing has promised all along (#270)', () => {
    // This used to pin 30 against the original migration: the product granted
    // 30 while every marketing surface said 14, so one of the two was wrong
    // for every signup. The founder decided 14; the 20260811 migration keeps
    // its historical 30 (applied migrations are never edited) and the
    // 20260814 migration's ALTER DEFAULT is what grants trials now.
    expect(TRIAL_DAYS).toBe(14);
    expect(trialEndsAt(NOW)).toBe(inDays(14));

    // The column default is what actually grants the trial — the app never
    // writes it on insert — so a TRIAL_DAYS the granting migration disagrees
    // with would make every countdown in the UI a fiction. Read out of the
    // SQL, not restated here.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260814000000_trial_days_14.sql'),
      'utf8'
    );
    const intervals = [...sql.matchAll(/interval '(\d+) days'/g)].map((m) => Number(m[1]));
    expect(intervals.length).toBeGreaterThan(0);
    for (const days of intervals) expect(days).toBe(TRIAL_DAYS);
  });

  it('no migration after the 14-day decision re-widens the default', () => {
    // The decision holds until a *newer* migration deliberately changes it —
    // an older file carrying 30 is history, a newer one would be a regression.
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const later = readdirSync(join(process.cwd(), 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f > '20260814000000_trial_days_14.sql');
    for (const file of later) {
      const sql = readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8');
      const defaults = [...sql.matchAll(/trial_ends_at[^;]*interval '(\d+) days'/g)];
      for (const m of defaults) {
        expect(Number(m[1]), `${file} changes the trial default`).toBe(TRIAL_DAYS);
      }
    }
  });
});

describe('the repair migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260811200000_organization_trial_backfill_repair.sql'
    ),
    'utf8'
  );

  /**
   * Applying 20260811150000 and reading the rows back found a `trialing`
   * organization with a NULL `trial_ends_at` — a trial the app reads as
   * `unknown`, so nothing ever displays or enforces it. `ADD COLUMN … DEFAULT`
   * did not fill the pre-existing rows the way the earlier fix assumed.
   */
  it('only ever fills a NULL, and only on a trialing row', () => {
    expect(sql).toContain('trial_ends_at IS NULL');
    expect(sql).toContain("subscription_status = 'trialing'");
    // Never touches a row's status, and never moves an end date that exists —
    // so a second run is a no-op and a subscriber cannot be given a trial.
    // Scoped to the SET clause: `subscription_status` legitimately appears in
    // the WHERE, and an unanchored match would read that as an assignment.
    const setClause = sql.slice(sql.indexOf('\nSET'), sql.indexOf('\nWHERE'));
    expect(setClause).toContain('trial_ends_at');
    expect(setClause).not.toContain('subscription_status');
  });
});

describe('the migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260811150000_organization_trial.sql'),
    'utf8'
  );

  it('never moves a row Stripe already knows about', () => {
    // A subscriber's status belongs to the webhook. Backfilling one into a
    // trial would downgrade a paying tenant on deploy.
    const backfill = sql.slice(sql.indexOf('UPDATE public.organizations'));
    expect(backfill).toContain('stripe_subscription_id IS NULL');
    expect(backfill).toContain("subscription_tier = 'free'");
  });

  it('is idempotent in both statements', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    // The backfill's guard is the status it moves rows *off*, so a second run
    // matches nothing. It must NOT be `trial_ends_at IS NULL`: ADD COLUMN with
    // a DEFAULT evaluates that default for every existing row, so such a check
    // would match nothing on the first run either — a backfill that silently
    // does nothing while the migration reports success.
    const backfill = sql.slice(sql.indexOf('UPDATE public.organizations'));
    expect(backfill).toContain("subscription_status = 'active'");
    expect(backfill).not.toContain('trial_ends_at IS NULL');
  });
});

describe('POST /api/quotes', () => {
  const authState = { status: 'trialing' as string, trialEnd: fromRealNow(-1) as string | null };
  const insertCalls: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.resetModules();
    insertCalls.length = 0;
    authState.status = 'trialing';
    authState.trialEnd = fromRealNow(-1);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_abcdef0123456789');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function postQuote() {
    vi.doMock('@/lib/apiAuth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
      return {
        ...actual,
        isDemoDeployment: () => false,
        requireOrgAccess: vi.fn(async () => ({
          ok: true,
          ctx: {
            organizationId: 'org-1',
            userId: 'user-1',
            role: 'owner',
            supabase: {
              from: () => ({
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        subscription_status: authState.status,
                        subscription_tier: 'free',
                        trial_ends_at: authState.trialEnd,
                      },
                      error: null,
                    }),
                  }),
                }),
                insert: (values: Record<string, unknown>) => {
                  insertCalls.push(values);
                  return {
                    select: () => ({
                      single: async () => ({ data: { id: 'quote-1', ...values }, error: null }),
                    }),
                  };
                },
              }),
            },
          },
        })),
      };
    });

    const { POST } = await import('@/app/api/quotes/route');
    return POST(
      new Request('http://localhost/api/quotes', {
        method: 'POST',
        body: JSON.stringify({ title: 'Instalación eléctrica' }),
      })
    );
  }

  it('refuses a new quote once the trial has expired, and creates nothing', async () => {
    const res = await postQuote();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe(TRIAL_EXPIRED_CODE);
    // The tenant has to be told their existing work still runs, or the message
    // reads as "we took your business hostage".
    expect(body.error.message).toMatch(/sigue funcionando/i);
    expect(insertCalls).toEqual([]);
  });

  it('lets a quote through while the trial is live', async () => {
    authState.trialEnd = fromRealNow(5);
    const res = await postQuote();
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });

  it('lets a quote through when the trial state cannot be read', async () => {
    authState.status = 'incomplete';
    authState.trialEnd = null;
    const res = await postQuote();
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Which routes the gate reaches (#128).
// ---------------------------------------------------------------------------

describe('the trial gate covers exactly the decided surface', () => {
  const read = (f: string) => readFileSync(f, 'utf8');

  it('gates creating new commercial work', () => {
    // The founder's decision was "no new quotes, contracts or CFDI". Recorded
    // as a list so adding a write route forces the question rather than
    // defaulting to ungated. (The outbound-reminder broadcast route was also
    // gated until it was removed as unreachable — nothing ever called it.)
    for (const file of [
      'app/api/quotes/route.ts',
      'app/api/quotes/[id]/convert/route.ts',
      'app/api/invoices/issue/route.ts',
      'app/api/invoices/[id]/complement/route.ts',
    ]) {
      // Both the call and its result being acted on. Asserting the import
      // alone passes for a gate that is wired up and never consulted — the
      // shape #187 caught in its dirty-form guard, and the reason a planted
      // import-only removal left this green on the first attempt.
      expect(read(file), file).toMatch(/await readOrganizationTrialState\(/);
      expect(read(file), file).toMatch(/if \(trial\.blocksNewWork\)/);
    }
  });

  it('never gates collection, correction, billing, or a tenant’s own client', () => {
    // Collecting what is already owed must not stop; billing is how a blocked
    // tenant gets *out* of the blocked state; and the public routes belong to
    // the buyer, who never agreed to anything with us.
    for (const file of [
      'app/api/receivables/[id]/confirm/route.ts',
      'app/api/receivables/[id]/upload/route.ts',
      'app/api/invoices/[id]/cancel/route.ts',
      'app/api/stripe/checkout/route.ts',
      'app/api/quotes/public/[token]/route.ts',
      'app/api/quotes/public/[token]/otp/route.ts',
      'app/api/receivables/public/[token]/route.ts',
    ]) {
      expect(read(file), file).not.toMatch(/readOrganizationTrialState/);
    }
  });
});

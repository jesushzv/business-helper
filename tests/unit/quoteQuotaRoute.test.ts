import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/quotes must *call* the quota gate (#271).
 *
 * The quota existed only as pricing copy — stated three contradictory ways and
 * enforced nowhere, the same "a fetch is not a control" shape as #203. The
 * refusal lives in the route: same seam as quoteClientCreditRoute.test.ts,
 * calling the real handler and asserting on what reaches the DB layer.
 */

const insertCalls: Array<Record<string, unknown>> = [];

const state = {
  tier: 'inicial' as string | null,
  monthCount: 0,
  countFails: false,
};

function organizationsTable() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { subscription_tier: state.tier }, error: null }),
  };
  return builder;
}

function quotesTable() {
  const builder = {
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        const countBuilder = {
          eq: () => countBuilder,
          gte: async () =>
            state.countFails
              ? { count: null, error: { message: 'boom' } }
              : { count: state.monthCount, error: null },
        };
        return countBuilder;
      }
      return builder;
    },
    insert: (values: Record<string, unknown>) => {
      insertCalls.push(values);
      return {
        select: () => ({ single: async () => ({ data: { id: 'quote-1', ...values }, error: null }) }),
      };
    },
  };
  return builder;
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
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
          from: (table: string) =>
            table === 'organizations' ? organizationsTable() : quotesTable(),
        },
      },
    })),
  };
});

// The trial and credit gates answer "unknown" (and so allow) through the
// mocks; this file is about the quota gate alone.
vi.mock('@/lib/organizationTrialGate', () => ({
  readOrganizationTrialState: async () => ({ blocksNewWork: false, endsAt: null }),
}));

const { POST } = await import('@/app/api/quotes/route');

function postQuote() {
  return POST(
    new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Suministro de Materiales' }),
    })
  );
}

beforeEach(() => {
  insertCalls.length = 0;
  state.tier = 'inicial';
  state.monthCount = 0;
  state.countFails = false;
});

describe('POST /api/quotes quota gate (#271)', () => {
  it('refuses the quote past 50 this month for an inicial org, writing nothing', async () => {
    state.monthCount = 50;

    const res = await postQuote();
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error.code).toBe('QUOTE_QUOTA_EXCEEDED');
    expect(body.error.message).toMatch(/50 cotizaciones/);
    expect(body.error.used).toBe(50);
    expect(insertCalls).toHaveLength(0);
  });

  it('creates quote 50 itself', async () => {
    state.monthCount = 49;

    const res = await postQuote();

    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });

  it('never meters a negocio org', async () => {
    state.tier = 'negocio';
    state.monthCount = 9999;

    const res = await postQuote();

    expect(res.status).toBe(201);
  });

  it('allows when the count read fails — unknown never gates (#64)', async () => {
    state.monthCount = 9999;
    state.countFails = true;

    const res = await postQuote();

    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });
});

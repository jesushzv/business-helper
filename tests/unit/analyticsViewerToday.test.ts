import { describe, it, expect, vi } from 'vitest';

/**
 * #263 (money-path review, finding 1) — the dashboard's PRIMARY data source is
 * this server route, and the server runs in UTC: without the viewer's day, a
 * cobro due today classified as Deuda Vencida from 18:00 in Mexico while the
 * client-computed Cobranza page said "Vence Hoy" about the same cobro — two
 * money surfaces disagreeing about one cobro. The client now sends
 * `?today=YYYY-MM-DD` and the route classifies by the VIEWER's day.
 */

const MILESTONE_DUE = '2026-08-14';

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  const table = (rows: unknown[]) => {
    const builder = {
      select: () => builder,
      eq: async () => ({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: {
          from: (name: string) => {
            if (name === 'milestones')
              return table([
                {
                  id: 'm-1',
                  contract_id: 'c-1',
                  client_id: 'cl-1',
                  label: 'Anticipo',
                  amount: 24500,
                  due_date: MILESTONE_DUE,
                  status: 'pending',
                  confirmed_at: null,
                },
              ]);
            if (name === 'quotes') return table([]);
            if (name === 'clients') return table([]);
            throw new Error(`unexpected table ${name}`);
          },
        },
      },
    })),
  };
});

const { GET } = await import('@/app/api/dashboard/analytics/route');

function get(query = '') {
  return GET(new Request(`http://localhost/api/dashboard/analytics${query}`));
}

describe('GET /api/dashboard/analytics?today= (#263)', () => {
  it("classifies by the viewer's day: due today, not Deuda Vencida", async () => {
    // The viewer says it is still the due date, whatever this server's clock
    // reads — the exact evening scenario from Mexico against a UTC server.
    const res = await get(`?today=${MILESTONE_DUE}`);
    const body = await res.json();

    expect(body.metrics.dueTodayAmount).toBe(24500);
    expect(body.metrics.overdueDebt).toBe(0);
    // And the forecast keeps the cobro in its 30-day bucket.
    expect(body.cashFlowForecast.days30.count).toBe(1);
    expect(body.cashFlowForecast.referenceDate).toBe(MILESTONE_DUE);
  });

  it('classifies as overdue once the viewer is genuinely past the due date', async () => {
    const res = await get('?today=2026-08-20');
    const body = await res.json();

    expect(body.metrics.overdueDebt).toBe(24500);
    expect(body.metrics.dueTodayAmount).toBe(0);
  });

  it('ignores a malformed today instead of classifying by attacker-chosen junk', async () => {
    const res = await get('?today=DROP%20TABLE');
    expect(res.status).toBe(200);
    const body = await res.json();
    // Falls back to the server clock: the buckets still sum to the milestone.
    const total =
      body.metrics.overdueDebt + body.metrics.dueTodayAmount + body.metrics.upcomingAmount;
    expect(total).toBe(24500);
  });
});

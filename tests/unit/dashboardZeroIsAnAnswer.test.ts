import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * #114 — the dashboard treated an all-zero server answer as "no answer".
 *
 * `hasApiData` asked whether the numbers were non-zero, not whether the
 * request succeeded, and fell through to locally computed figures when
 * `collectedRevenue`, `pendingReceivables` and `topClients` were all empty.
 * Every newly onboarded tenant has exactly those zeros — so the headline MXN
 * cards showed figures that were not theirs at the moment first impressions
 * are formed. Before #96 those figures came from `useReceivables`' demo
 * fixtures, putting ~$145,000 of invented revenue on the dashboard.
 *
 * Zero is a real answer. This pins that, and pins the failure direction next
 * to it: when the request fails, the error surfaces.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is stubbed throughout — without it the hooks take
 * their demo branch and this file asserts nothing (LESSONS.md).
 */

/**
 * The sub-hooks carry rows on purpose, and this is load-bearing.
 *
 * With every mock returning `[]`, the locally computed fallback produces the
 * same zeros the server does — so the test passes whichever branch runs, and
 * proves nothing. (It did: reverting the fix left this file green until these
 * rows were added.) Non-zero computed figures are what make the two branches
 * distinguishable, so an assertion of `0` means "the server's answer won".
 */
const COMPUTED_SOURCE = [
  {
    id: 'm-1',
    contract_id: 'c-1',
    client_id: 'cl-1',
    client_name: 'Cliente Real',
    label: 'Anticipo',
    amount: 87_500,
    due_date: '2026-08-01',
    status: 'confirmed',
    confirmed_at: '2026-08-01T00:00:00Z',
  },
];

vi.mock('@/lib/hooks/useClients', () => ({
  useClients: () => ({
    clients: [{ id: 'cl-1', name: 'Cliente Real', health_score: 90 }],
    loading: false,
    error: null,
  }),
}));
vi.mock('@/lib/hooks/useQuotes', () => ({
  useQuotes: () => ({ quotes: [], loading: false, error: null }),
}));
vi.mock('@/lib/hooks/useReceivables', () => ({
  useReceivables: () => ({ receivables: COMPUTED_SOURCE, loading: false, error: null }),
}));

import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';

/** What the API returns for a tenant who has just onboarded. */
const ALL_ZEROS = {
  metrics: {
    collectedRevenue: 0,
    pendingReceivables: 0,
    overdueAmount: 0,
    quotesSent: 0,
    conversionRate: 0,
  },
  topClients: [],
  cashFlowForecast: { thisWeek: 0, thisMonth: 0, nextMonth: 0, overdue: 0 },
};

describe('dashboard KPIs — zero is a real answer (#114)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders the server\'s zeros instead of falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(ALL_ZEROS), { status: 200 }))
    );

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 0, not the 87,500 the computed fallback would produce from the rows
    // above. That difference is the whole test.
    expect(result.current.metrics.collectedRevenue).toBe(0);
    expect(result.current.metrics.pendingReceivables).toBe(0);
    expect(result.current.topClients).toEqual([]);
    // The server answered, so there is nothing to report as an error.
    expect(result.current.error).toBeNull();
  });

  it('shows no demo tenant anywhere in the numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(ALL_ZEROS), { status: 200 }))
    );

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const rendered = JSON.stringify(result.current);
    for (const fixture of [
      'Construcciones Maya',
      'Desarrollos Inmobiliarios del Norte',
      'Taller Industrial Regiomontano',
      'Distribuidora del Norte',
    ]) {
      expect(rendered, `${fixture} is a fixture and must not reach a real tenant`).not.toContain(
        fixture
      );
    }
  });

  it('uses a non-zero server answer as-is', async () => {
    const real = {
      ...ALL_ZEROS,
      metrics: { ...ALL_ZEROS.metrics, collectedRevenue: 128_400, pendingReceivables: 42_000 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(real), { status: 200 }))
    );

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metrics.collectedRevenue).toBe(128_400);
  });

  it('reports a failed read rather than presenting a confident total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The computed figures below derive from the sub-hooks' own rows, so they
    // are legitimate — what must not happen is showing them with nothing
    // saying the server never answered.
    expect(result.current.error).toBeTruthy();
  });
});

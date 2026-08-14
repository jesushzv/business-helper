import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectedAmount } from '@/lib/receivablesCalculator';

/**
 * #351 — a partial payment booked as paid in full, outside Cobranza.
 *
 * The scenario throughout is #253's, because it is the same money: a $20,000
 * wire against a $48,720 cobro. Cobranza has reported that correctly since
 * #253; the dashboard KPI cards and the WhatsApp assistant did not, because
 * neither of their queries selected `transferred_amount` and `collectedAmount`
 * read the absent column as "the full amount arrived".
 *
 * `milestoneMoneySelects.test.ts` stops the next query from forgetting the
 * column. These are the two surfaces that had, asked the tenant's question:
 * how much did we actually collect?
 */

const OWED = 48720;
const WIRED = 20000;

/** A confirmed cobro that came up short, shaped as PostgREST returns it. */
const PARTIALLY_PAID = {
  id: 'm-1',
  contract_id: 'c-1',
  client_id: 'cl-1',
  label: 'Anticipo 50% — Suministro Cemento',
  amount: OWED,
  transferred_amount: WIRED,
  cfdi_total: null,
  cfdi_status: null,
  due_date: '2026-08-10',
  status: 'confirmed',
  confirmed_at: '2026-08-11T12:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('the dashboard KPI cards report what arrived (#351)', () => {
  it('books a short wire as collected-in-part, not collected-in-full', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({ isSupabaseConfigured: () => true }));
    vi.doMock('@/lib/apiAuth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
      const table = (rows: unknown[]) => {
        const builder = { select: () => builder, eq: async () => ({ data: rows, error: null }) };
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
                if (name === 'milestones') return table([PARTIALLY_PAID]);
                if (name === 'quotes') return table([]);
                if (name === 'clients') return table([{ id: 'cl-1', name: 'Constructora Maya' }]);
                throw new Error(`unexpected table ${name}`);
              },
            },
          },
        })),
      };
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const res = await GET(new Request('http://localhost/api/dashboard/analytics?today=2026-08-30'));
    const body = await res.json();

    // The whole defect in three numbers: $48,720 collected and $0 pending was
    // the old answer, and the server answer wins over the locally computed
    // one — so the KPI cards and Cobranza disagreed about this cobro.
    expect(body.metrics.collectedRevenue).toBe(WIRED);
    expect(body.metrics.pendingReceivables).toBe(OWED - WIRED);
    expect(body.metrics.overdueDebt).toBe(OWED - WIRED);
    expect(body.metrics.pendingMilestonesCount).toBe(1);
  });

  it('ranks the client by the money that arrived', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({ isSupabaseConfigured: () => true }));
    vi.doMock('@/lib/apiAuth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
      const table = (rows: unknown[]) => {
        const builder = { select: () => builder, eq: async () => ({ data: rows, error: null }) };
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
                if (name === 'milestones') return table([PARTIALLY_PAID]);
                if (name === 'quotes') return table([]);
                if (name === 'clients') return table([{ id: 'cl-1', name: 'Constructora Maya' }]);
                throw new Error(`unexpected table ${name}`);
              },
            },
          },
        })),
      };
    });

    const { GET } = await import('@/app/api/dashboard/analytics/route');
    const res = await GET(new Request('http://localhost/api/dashboard/analytics?today=2026-08-30'));
    const body = await res.json();

    expect(body.topClients).toHaveLength(1);
    expect(body.topClients[0].totalRevenue).toBe(WIRED);
  });
});

describe('the assistant answers "¿cuánto hemos cobrado?" with what arrived (#351)', () => {
  it('sums the transfers, not the invoiced amounts', async () => {
    const { loadAIOrgContext } = await import('@/lib/aiOrgContext');

    const table = (rows: unknown[]) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    };

    const supabase = {
      from: (name: string) => {
        if (name === 'clients') return table([{ id: 'cl-1', name: 'Constructora Maya', phone: '8112223344' }]);
        // Both milestone reads answer from the same row set; the open read
        // filters to open statuses live, and this one is the confirmed read.
        if (name === 'milestones')
          return table([{ ...PARTIALLY_PAID, contracts: { client_id: 'cl-1' } }]);
        throw new Error(`unexpected table ${name}`);
      },
    };

    const context = await loadAIOrgContext(supabase, 'org-1');

    expect(context.collected).toHaveLength(1);
    // Not $48,720: the assistant labels its answer `engine: 'rules'`, which
    // says a rules engine computed the figure. It has to be the true one.
    expect(context.collected?.[0].amount).toBe(WIRED);
  });
});

describe('collectedAmount can tell an unselected column from a null one (#351)', () => {
  it('reads a NULL transferred_amount as "the full amount arrived"', () => {
    // The legitimate legacy case, unchanged: the confirmation itself recorded
    // that the amount arrived, before the column carried a figure.
    expect(collectedAmount({ ...PARTIALLY_PAID, transferred_amount: null })).toBe(OWED);
  });

  it('keeps an explicit zero at zero', () => {
    expect(collectedAmount({ ...PARTIALLY_PAID, transferred_amount: 0 })).toBe(0);
  });

  it('complains loudly when the query never selected the column', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { transferred_amount: _dropped, ...unselected } = PARTIALLY_PAID;

    // The figure stays what it has always been rather than swapping one wrong
    // number for another — but it can no longer happen quietly, which is what
    // let this run in production across two surfaces.
    expect(collectedAmount(unselected as never)).toBe(OWED);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('transferred_amount');
    expect(error.mock.calls[0][0]).toContain('m-1');
  });

  it('says nothing when the column is present', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(collectedAmount(PARTIALLY_PAID)).toBe(WIRED);
    expect(error).not.toHaveBeenCalled();
  });
});

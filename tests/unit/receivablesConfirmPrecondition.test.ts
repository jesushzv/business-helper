import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #286 — confirming a payment twice must not record it twice.
 *
 * The UPDATE matched on id and organization alone, so a second POST — a
 * double-tap on a 3G phone, a retried request, a reopened modal — succeeded:
 * `confirmed_at` was rewritten to the later moment, the `payment_confirmed`
 * event fired again (a funnel counting one real payment as two), and a second
 * audit row landed under the same milestone.
 *
 * The fix carries the not-yet-confirmed predicate *inside* the write, the way
 * the public sibling does. That makes the answer to "0 rows changed" the load
 * bearing part: it looks exactly like success, and it has two causes that call
 * for opposite next steps.
 */

const state = {
  role: 'owner' as string,
  /** What the guarded UPDATE returns — null stands for "0 rows matched". */
  updateResult: null as Record<string, unknown> | null,
  /** What the follow-up read finds, when the UPDATE changed nothing. */
  existingRow: null as Record<string, unknown> | null,
  auditInserts: 0,
};

const trackMock = vi.fn();

vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => false,
  createServiceClient: () => {
    throw new Error('not configured in tests');
  },
}));

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        supabase: makeSupabaseMock(),
        userId: 'user-1',
        organizationId: 'org-1',
        role: state.role,
      },
    })),
  };
});

/** Records whether the write carried its precondition, and answers accordingly. */
const writeCalls: { neqApplied: boolean }[] = [];

function makeSupabaseMock() {
  const updateChain = () => {
    const call = { neqApplied: false };
    writeCalls.push(call);
    const chain: Record<string, unknown> = {
      eq: () => chain,
      neq: () => {
        call.neqApplied = true;
        return chain;
      },
      select: () => chain,
      maybeSingle: async () => ({ data: state.updateResult, error: null }),
    };
    return chain;
  };

  const readChain = () => {
    const chain: Record<string, unknown> = {
      eq: () => chain,
      maybeSingle: async () => ({ data: state.existingRow, error: null }),
    };
    return chain;
  };

  return {
    from: (table: string) => ({
      update: () => updateChain(),
      select: () => readChain(),
      insert: async () => {
        if (table === 'audit_logs') state.auditInserts += 1;
        return { error: null };
      },
    }),
  };
}

const params = Promise.resolve({ id: 'm-1' });

function confirmRequest(body: Record<string, unknown> = {}) {
  return new Request('https://businesshelper.app/api/receivables/m-1/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.role = 'owner';
  state.updateResult = null;
  state.existingRow = null;
  state.auditInserts = 0;
  writeCalls.length = 0;
  trackMock.mockClear();
});

describe('POST /api/receivables/[id]/confirm is not repeatable', () => {
  it('confirms a pending cobro once, recording the payment', async () => {
    state.updateResult = {
      id: 'm-1',
      contract_id: 'c-1',
      label: 'Anticipo',
      amount: 48720,
      transferred_amount: 20000,
      status: 'confirmed',
    };

    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(confirmRequest({}), { params });

    expect(res.status).toBe(200);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(state.auditInserts).toBe(1);
    // The predicate is in the write, not in a check before it — two taps that
    // both pass a prior read would both write.
    expect(writeCalls[0].neqApplied).toBe(true);
  });

  it('answers 409 on the second confirmation and records nothing again', async () => {
    // The guarded UPDATE matches no row; the cobro is there and already confirmed.
    state.updateResult = null;
    state.existingRow = { id: 'm-1', status: 'confirmed', confirmed_at: '2026-08-13T10:00:00.000Z' };

    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(confirmRequest({}), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('ALREADY_CONFIRMED');
    expect(body.error.message).toMatch(/ya estaba confirmado/i);
    // The two consequences the repeat used to have.
    expect(trackMock).not.toHaveBeenCalled();
    expect(state.auditInserts).toBe(0);
    // And the original confirmation is echoed rather than overwritten.
    expect(body.milestone.confirmed_at).toBe('2026-08-13T10:00:00.000Z');
  });

  it('still says 404 when the cobro is not this organization\'s', async () => {
    // Zero rows changed looks the same in both cases; the tenant is told which.
    state.updateResult = null;
    state.existingRow = null;

    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(confirmRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(trackMock).not.toHaveBeenCalled();
  });

  /**
   * This case used to assert that a `transferredAmount` of 0 was refused as
   * INVALID_INPUT. The route does not take an amount at all since #394: money
   * that arrived is recorded as a payment against the ledger, and confirming
   * confirms what the ledger holds. A caller still sending one is refused **by
   * name** rather than having it dropped, because a silent drop is a 200 for a
   * money write that never happened (#95).
   */
  it('refuses an amount by name instead of writing it as a total', async () => {
    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');

    for (const transferredAmount of [20000, 0]) {
      const res = await POST(confirmRequest({ transferredAmount }), { params });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('AMOUNT_NOT_WRITABLE_HERE');
      expect(body.error.message).toMatch(/regístralo como un pago/i);
      expect(body.error.fields?.transferredAmount).toBeTruthy();
    }

    // Refused before the row is touched, so a rejected body cannot confirm.
    expect(writeCalls).toHaveLength(0);
  });
});

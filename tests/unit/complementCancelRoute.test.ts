import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planPaymentComplement } from '@/lib/complementoPago';

/**
 * #30 — a complemento de pago stamped in error could not be cancelled.
 *
 * A complement is a separate stamped document with its own folio fiscal and
 * its own PAC invoice id. `/api/invoices/[id]/cancel` cancels the invoice;
 * nothing cancelled a complement. So a milestone whose complement was stamped
 * in error — wrong amount, wrong date, a payment that bounced — was stuck
 * **twice**: the complement was wrong and could not be withdrawn, and the SAT
 * will not accept the cancellation of a PPD invoice while a complement
 * referencing it is still live, so the invoice was stuck behind it.
 */

const authState = { role: 'owner' as string };

const dbState = {
  complement: null as Record<string, unknown> | null,
  liveComplements: [] as Record<string, unknown>[],
  milestone: null as Record<string, unknown> | null,
  updateResult: { data: [{ id: 'comp-1' }] as Array<{ id: string }> | null, error: null as unknown },
  updates: [] as Record<string, unknown>[],
};

type PacCancelResult =
  | { ok: true; data: { status: string; cancelledAt: string } }
  | { ok: false; code: string; message: string };

// Hoisted: `vi.mock` factories run before top-level consts are initialised,
// and importing `planPaymentComplement` pulls `lib/pacClient` in through
// `lib/complementoPago`, so the factory is evaluated during this file's own
// import. Without `vi.hoisted` that is a TDZ error, not a mocking problem.
const { pacState, cancelInvoiceMock } = vi.hoisted(() => {
  const state = {
    cancel: {
      ok: true,
      data: { status: 'cancelled', cancelledAt: '2026-08-14T10:00:00.000Z' },
    } as PacCancelResult,
  };
  return {
    pacState: state,
    cancelInvoiceMock: vi.fn(
      async (
        _credentials: unknown,
        _providerInvoiceId: string,
        _motive: string,
        _substitution?: string
      ) => state.cancel
    ),
  };
});

vi.mock('@/lib/pacClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pacClient')>();
  return { ...actual, cancelInvoice: cancelInvoiceMock };
});

vi.mock('@/lib/pacConnection', () => ({
  resolvePacCredentials: async () => ({
    ok: true,
    credentials: { provider: 'facturapi', environment: 'sandbox', apiKey: 'sk_test' },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: authState.role,
        supabase: {
          from: (table: string) => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self;
            chain.eq = self;
            chain.update = (values: Record<string, unknown>) => {
              dbState.updates.push(values);
              chain.select = async () => dbState.updateResult;
              return chain;
            };
            chain.maybeSingle = async () => ({
              data: table === 'milestones' ? dbState.milestone : dbState.complement,
              error: null,
            });
            // The live-complement lookup ends in .order(), not .maybeSingle().
            chain.order = async () => ({ data: dbState.liveComplements, error: null });
            return chain;
          },
        },
      },
    })),
  };
});

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

const params = Promise.resolve({ id: 'm-1', complementId: 'comp-1' });

function post(body: Record<string, unknown> = { motive: '02' }) {
  return new Request('http://test/api/invoices/m-1/complement/comp-1/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authState.role = 'owner';
  dbState.complement = {
    id: 'comp-1',
    installment: 2,
    amount: 20000,
    status: 'issued',
    cfdi_id: 'inv_comp_1',
    cfdi_uuid: 'UUID-COMP-2',
    milestone_id: 'm-1',
  };
  dbState.liveComplements = [];
  dbState.milestone = {
    id: 'm-1',
    label: 'Anticipo',
    contract_id: 'c-1',
    cfdi_id: 'inv_1',
    cfdi_uuid: 'UUID-INV',
    cfdi_status: 'issued',
  };
  dbState.updateResult = { data: [{ id: 'comp-1' }], error: null };
  dbState.updates = [];
  pacState.cancel = {
    ok: true,
    data: { status: 'cancelled', cancelledAt: '2026-08-14T10:00:00.000Z' },
  };
  cancelInvoiceMock.mockClear();
});

describe('POST /api/invoices/[id]/complement/[complementId]/cancel (#30)', () => {
  it('cancels the complement at the PAC with its own invoice id', async () => {
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    // The complement's own PAC id, not the invoice's — they are separate
    // documents and cancelling the wrong one is not undoable.
    expect(cancelInvoiceMock.mock.calls[0][1]).toBe('inv_comp_1');
    expect(cancelInvoiceMock.mock.calls[0][2]).toBe('02');
    expect(body.uuid).toBe('UUID-COMP-2');
    expect(body.installment).toBe(2);
    expect(dbState.updates[0]).toMatchObject({ status: 'cancelled' });
  });

  it('says so when the SAT is holding the cancellation pending acceptance', async () => {
    pacState.cancel = {
      ok: true,
      data: { status: 'pending', cancelledAt: '2026-08-14T10:00:00.000Z' },
    };
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('pending');
    // Recorded on the row, not presented as settled (hard rule 1).
    expect(dbState.updates[0].error).toMatch(/pendiente de aceptación/i);
  });

  it('refuses a motive the SAT does not define, before calling the PAC', async () => {
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post({ motive: '99' }), { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_MOTIVE');
    expect(cancelInvoiceMock).not.toHaveBeenCalled();
  });

  it('refuses a complement that was never stamped', async () => {
    dbState.complement = { ...dbState.complement, status: 'failed', cfdi_id: null };
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('NOT_ISSUED');
    expect(cancelInvoiceMock).not.toHaveBeenCalled();
  });

  it('says plainly when it is already cancelled', async () => {
    dbState.complement = { ...dbState.complement, status: 'cancelled' };
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });

    expect((await res.json()).error.message).toMatch(/ya está cancelado/i);
  });

  it('404s for a complement id that is not this cobro\'s', async () => {
    // The lookup is scoped by complement id AND milestone AND organization, so
    // a complement from another cobro simply does not resolve.
    dbState.complement = null;
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });

    expect(res.status).toBe(404);
    expect(cancelInvoiceMock).not.toHaveBeenCalled();
  });

  it.each(['member', 'accountant'])('gates on issue_cfdi — %s', async (role) => {
    authState.role = role;
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    // The accountant holds issue_cfdi and the member does not.
    expect(res.status).toBe(role === 'accountant' ? 200 : 403);
  });

  it('reports a cancellation the SAT took but the row did not record', async () => {
    // 0 rows changed looks exactly like success (#128) — and here it means a
    // document cancelled at the SAT still reading as live in every balance.
    dbState.updateResult = { data: [], error: null };
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('CANCEL_NOT_RECORDED');
    // The folio is handed back — it is the only trace the tenant has left.
    expect(body.uuid).toBe('UUID-COMP-2');
  });

  it('passes the PAC refusal through rather than claiming success', async () => {
    pacState.cancel = { ok: false, code: 'REJECTED', message: 'El SAT rechazó la cancelación.' };
    const { POST } = await import('@/app/api/invoices/[id]/complement/[complementId]/cancel/route');
    const res = await POST(post(), { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('PAC_REJECTED');
    expect(dbState.updates).toEqual([]);
  });
});

describe('the invoice refuses to cancel behind a live complement (#30)', () => {
  it('names the parcialidades to cancel first instead of letting the PAC reject', async () => {
    dbState.liveComplements = [
      { id: 'comp-1', installment: 1, cfdi_uuid: 'UUID-COMP-1' },
      { id: 'comp-2', installment: 2, cfdi_uuid: 'UUID-COMP-2' },
    ];
    const { POST } = await import('@/app/api/invoices/[id]/cancel/route');
    const res = await POST(post(), { params: Promise.resolve({ id: 'm-1' }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('HAS_LIVE_COMPLEMENTS');
    expect(body.error.message).toContain('parcialidad 1, 2');
    // Which ones, so the caller can act without a second round-trip.
    expect(body.complements).toHaveLength(2);
    // And the PAC was never asked, so there is no rejection to explain away.
    expect(cancelInvoiceMock).not.toHaveBeenCalled();
  });

  it('cancels the invoice once no complement is live', async () => {
    dbState.liveComplements = [];
    const { POST } = await import('@/app/api/invoices/[id]/cancel/route');
    const res = await POST(post(), { params: Promise.resolve({ id: 'm-1' }) });

    expect(res.status).toBe(200);
    expect(cancelInvoiceMock).toHaveBeenCalled();
  });
});

describe('what a cancellation does to the balance and the numbering (#30)', () => {
  const milestone = {
    amount: 48720,
    cfdi_total: 48720,
    cfdi_status: 'issued',
    cfdi_uuid: 'UUID-INV',
    cfdi_payment_method: 'PPD',
    transferred_amount: 48720,
  };

  it('frees the cancelled complement\'s amount again', () => {
    // Nothing recomputes anything: the balance is derived, and
    // planPaymentComplement counts only `issued` rows.
    const live = planPaymentComplement(milestone, [
      { installment: 1, amount: 20000, status: 'issued' },
      { installment: 2, amount: 28720, status: 'issued' },
    ]);
    expect(live.required).toBe(false);

    const afterCancel = planPaymentComplement(milestone, [
      { installment: 1, amount: 20000, status: 'issued' },
      { installment: 2, amount: 28720, status: 'cancelled' },
    ]);
    expect(afterCancel.required).toBe(true);
    if (afterCancel.required) {
      // The $28,720 the cancelled complement had declared is owed again.
      expect(afterCancel.amount).toBe(28720);
      expect(afterCancel.lastBalance).toBe(28720);
    }
  });

  it('never reuses the cancelled parcialidad — the replacement is the next number', () => {
    // The decision taken on #30. SAT numbering is sequential per document, and
    // two documents sharing one NumParcialidad for one invoice — with one of
    // them cancelled — is worse than a gap in the sequence. The gap *is* the
    // record of the cancellation.
    const afterCancel = planPaymentComplement(milestone, [
      { installment: 1, amount: 20000, status: 'issued' },
      { installment: 2, amount: 28720, status: 'cancelled' },
    ]);

    expect(afterCancel.required).toBe(true);
    if (afterCancel.required) {
      // **3, not 2.** This is the defect the decision surfaced: with
      // parcialidad 2 cancelled, one issued row remains, so the old
      // `issued.length + 1` said 2 — the cancelled document's own number —
      // and the partial unique index still holds 2 for it, so filing the
      // replacement would have collided with a 23505.
      expect(afterCancel.installment).toBe(3);
    }
  });

  it('still lets a failed attempt retry on the number it was aiming at', () => {
    // A failed row consumed no parcialidad and the index excludes `failed` for
    // the same reason, so the retry lands on 2 rather than skipping to 3.
    const afterFailure = planPaymentComplement(milestone, [
      { installment: 1, amount: 20000, status: 'issued' },
      { installment: 2, amount: 28720, status: 'failed' },
    ]);

    expect(afterFailure.required).toBe(true);
    if (afterFailure.required) expect(afterFailure.installment).toBe(2);
  });

  it('starts at 1 for a document with nothing on record', () => {
    const first = planPaymentComplement(milestone, []);
    expect(first.required).toBe(true);
    if (first.required) expect(first.installment).toBe(1);
  });
});

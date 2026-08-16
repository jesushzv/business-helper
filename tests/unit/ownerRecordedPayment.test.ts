import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordOwnerPayment } from '@/lib/milestonePayments';
import { MILESTONE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { readFileSync } from 'node:fs';

/**
 * #394, option A — the owner's own wire becomes a ledger row.
 *
 * `milestone_payments` (#381) had one writer: the payer's declaration. The two
 * owner-side routes wrote `milestones.transferred_amount` as an **absolute
 * total** and recorded nothing, so the ledger was a partial record of what
 * *payers* said — and a partial ledger is worse than none, because the first
 * consumer to sum it and call it "recibido" reintroduces the defect #381
 * closed.
 *
 * The case that must exist, per #394 and because PR #393's first draft got
 * exactly this wrong: **an owner-recorded wire followed by a payer
 * declaration.** Every test in this area used to feed a single source, which is
 * why the interaction between the two was invisible.
 */

interface MilestoneRow {
  id: string;
  organization_id: string;
  status: string;
  amount: number;
  transferred_amount: number | null;
  tracking_reference: string | null;
  receipt_url: string | null;
}

interface PaymentRow {
  milestone_id: string;
  amount: number;
  source: string;
  tracking_reference: string | null;
  receipt_url: string | null;
  declared_at: string | null;
}

const db: {
  milestones: MilestoneRow[];
  payments: PaymentRow[];
  rpcError: { code: string; message: string } | null;
} = { milestones: [], payments: [], rpcError: null };

function resetDb(status = 'pending', transferred: number | null = null) {
  db.milestones = [
    {
      id: 'milestone-1',
      organization_id: 'org-1',
      status,
      amount: 48720,
      transferred_amount: transferred,
      tracking_reference: null,
      receipt_url: null,
    },
  ];
  db.payments = [];
  db.rpcError = null;
}

/**
 * `record_owner_payment`, in JS — including the two things that make it differ
 * from its payer-facing sibling: **no status filter** on the UPDATE, and **no
 * status write**.
 */
function callRecordOwnerPayment(args: Record<string, unknown>) {
  if (db.rpcError) return { data: null, error: db.rpcError };

  const amount = Number(args.p_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { data: null, error: { code: '22023', message: 'amount must be greater than zero' } };
  }

  // No status in the predicate: a payment may be recorded against a cobro in
  // any state, which is how a confirmed-and-short one reaches the ledger.
  const milestone = db.milestones.find(
    (m) => m.id === args.p_milestone_id && m.organization_id === args.p_organization_id
  );
  if (!milestone) return { data: null, error: null };

  milestone.transferred_amount =
    Math.round(((milestone.transferred_amount ?? 0) + amount) * 100) / 100;
  if (args.p_tracking_reference != null) {
    milestone.tracking_reference = args.p_tracking_reference as string;
  }
  if (args.p_receipt_url != null) milestone.receipt_url = args.p_receipt_url as string;
  // Deliberately absent: `milestone.status` is not touched.

  db.payments.push({
    milestone_id: milestone.id,
    amount,
    source: 'owner_record',
    tracking_reference: (args.p_tracking_reference as string) ?? null,
    receipt_url: (args.p_receipt_url as string) ?? null,
    declared_at: (args.p_declared_at as string) ?? '2026-08-15T00:00:00.000Z',
  });

  // PostgREST hands `numeric` back as a string.
  return { data: String(milestone.transferred_amount), error: null };
}

/** The payer's declaration, for the two-source case — adds on the row, same as the SQL. */
function callRecordMilestonePayment(args: Record<string, unknown>) {
  const amount = Number(args.p_amount);
  const milestone = db.milestones.find(
    (m) =>
      m.id === args.p_milestone_id &&
      m.organization_id === args.p_organization_id &&
      ['pending', 'requested'].includes(m.status)
  );
  if (!milestone) return { data: null, error: null };

  milestone.status = 'marked_paid';
  milestone.transferred_amount =
    Math.round(((milestone.transferred_amount ?? 0) + amount) * 100) / 100;
  db.payments.push({
    milestone_id: milestone.id,
    amount,
    source: 'payer_declaration',
    tracking_reference: (args.p_tracking_reference as string) ?? null,
    receipt_url: null,
    declared_at: null,
  });
  return { data: String(milestone.transferred_amount), error: null };
}

function makeClient() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'record_owner_payment') return callRecordOwnerPayment(args);
      if (name === 'record_milestone_payment') return callRecordMilestonePayment(args);
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

const base = {
  milestoneId: 'milestone-1',
  organizationId: 'org-1',
};

beforeEach(() => {
  resetDb();
  vi.restoreAllMocks();
});

describe('recordOwnerPayment', () => {
  it('appends a row the ledger can tell apart from a payer claim', async () => {
    const result = await recordOwnerPayment({
      supabase: makeClient(),
      ...base,
      amount: 20000,
      trackingReference: 'SPEI20260814000001',
    });

    expect(result).toEqual({ ok: true, total: 20000 });
    expect(db.payments).toHaveLength(1);
    // The distinction is the whole reason the column exists: a bank statement
    // is not a claim made over a public link.
    expect(db.payments[0].source).toBe('owner_record');
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('does NOT move the status — an owner is not waiting to confirm their own figure', async () => {
    await recordOwnerPayment({ supabase: makeClient(), ...base, amount: 20000 });

    // `marked_paid` means "a declaration awaits confirmation". Writing it here
    // would put the cobro in a queue for the person who just recorded it.
    expect(db.milestones[0].status).toBe('pending');
  });

  it('records against a confirmed-and-short cobro, which is how the remainder gets in (#382)', async () => {
    resetDb('confirmed', 20000);

    const result = await recordOwnerPayment({ supabase: makeClient(), ...base, amount: 28720 });

    expect(result).toEqual({ ok: true, total: 48720 });
    expect(db.milestones[0].status).toBe('confirmed');
  });

  /**
   * The case #394 names, and the one PR #393's first draft got wrong: the
   * ledger held payer declarations only, so an owner-recorded $20,000 was
   * *overwritten* by the payer's $28,720 rather than added to.
   */
  it('sums an owner-recorded wire and a payer declaration instead of losing one', async () => {
    const client = makeClient();

    await recordOwnerPayment({ supabase: client, ...base, amount: 20000 });
    const { recordMilestonePayment } = await import('@/lib/milestonePayments');
    const second = await recordMilestonePayment({
      supabase: client,
      ...base,
      amount: 28720,
      source: 'payer_declaration',
      trackingReference: 'SPEI20260815000002',
    });

    expect(second).toEqual({ ok: true, total: 48720 });
    expect(db.milestones[0].transferred_amount).toBe(48720);
    expect(db.payments.map((p) => p.source)).toEqual(['owner_record', 'payer_declaration']);
    expect(db.payments.map((p) => p.amount)).toEqual([20000, 28720]);
  });

  it('keeps two owner records as two rows — a ledger is not a set', async () => {
    const client = makeClient();
    await recordOwnerPayment({ supabase: client, ...base, amount: 10000 });
    await recordOwnerPayment({ supabase: client, ...base, amount: 10000 });

    expect(db.payments).toHaveLength(2);
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('carries the date the money landed, not the date it was typed', async () => {
    await recordOwnerPayment({
      supabase: makeClient(),
      ...base,
      amount: 5000,
      declaredAt: '2026-08-01T17:00:00.000Z',
    });

    // Parcialidad numbering is chronological and a complemento's FechaPago
    // comes from it (#395), so a wire entered late must not date to today.
    expect(db.payments[0].declared_at).toBe('2026-08-01T17:00:00.000Z');
  });

  it('refuses a non-payment before it reaches the database', async () => {
    const client = makeClient();
    const rpc = vi.spyOn(client, 'rpc');

    for (const amount of [0, -100, Number.NaN]) {
      const result = await recordOwnerPayment({ supabase: client, ...base, amount });
      expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYMENT_AMOUNT' });
    }
    // A correction downward is not a payment; this ledger does not model
    // refunds, and the CHECK saying so as a 500 is a thrown-away diagnosis.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports another tenant’s milestone as not payable rather than writing anything', async () => {
    const result = await recordOwnerPayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-2',
      amount: 5000,
    });

    expect(result).toEqual({ ok: false, reason: 'not_payable' });
    expect(db.payments).toHaveLength(0);
    expect(db.milestones[0].transferred_amount).toBeNull();
  });

  it('keeps the original database error so a missing migration is diagnosable', async () => {
    db.rpcError = { code: '42P01', message: 'relation "milestone_payments" does not exist' };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await recordOwnerPayment({ supabase: makeClient(), ...base, amount: 5000 });

    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    // 42P01 is the likeliest failure the day this ships — Vercel deploys `main`
    // before migrations are applied by hand — and an operator must be able to
    // tell it from a constraint violation (#146/#148).
    expect((result as { dbError?: { code: string } }).dbError?.code).toBe('42P01');
  });

  it('survives numeric arriving as a string, which is how PostgREST sends it', async () => {
    const result = await recordOwnerPayment({ supabase: makeClient(), ...base, amount: 1500.5 });
    expect(result).toEqual({ ok: true, total: 1500.5 });
  });
});

describe('transferred_amount is no longer an absolute-total input (#394)', () => {
  it('is not a writable field on PUT /api/receivables/[id]', () => {
    // The inflation vector itself: a total cannot be appended to an
    // append-only ledger, so while this was writable the route recorded no row.
    expect(MILESTONE_WRITABLE_FIELDS).not.toContain('transferred_amount');
  });

  it('is refused by name, not dropped in silence', () => {
    // A swallowed money write reported as success is #95's defect class, so
    // the route must answer rather than let `pickFields` discard it quietly.
    const source = readFileSync('app/api/receivables/[id]/route.ts', 'utf8');
    expect(source).toContain('AMOUNT_NOT_WRITABLE_HERE');
    expect(source).toMatch(/body\?\.transferred_amount !== undefined/);
  });

  it('lets the authorization refusal win over the field-shape one', () => {
    // Order matters: a caller who may not do this at all is refused for that
    // reason. `receivablesRBAC.test.ts` pins the behaviour; this pins the
    // ordering in the source, which is what regressed while writing #394.
    const source = readFileSync('app/api/receivables/[id]/route.ts', 'utf8');
    expect(source.indexOf("'FORBIDDEN'")).toBeLessThan(source.indexOf('AMOUNT_NOT_WRITABLE_HERE'));
  });
});


/**
 * The hook half (#394): `recordPayment` applies the **server's** total.
 *
 * `transferred_amount` reads as "the full amount arrived" when it is NULL on a
 * confirmed row (lib/receivablesCalculator.ts), so a locally-guessed total here
 * has a direction: it overstates. The mutation therefore takes the number the
 * database computed, or reports a failure — it never adds up its own.
 */
const LIST_ROW = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 48720,
  transferred_amount: 20000,
  due_date: '2026-09-15',
  status: 'confirmed',
};

describe('useReceivables.recordPayment applies the server row (#394)', () => {
  it('sends this payment and takes back the total the database computed', async () => {
    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { useReceivables } = await import('@/lib/hooks/useReceivables');

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/payments')) {
        return new Response(JSON.stringify({ success: true, transferred_amount: 48720 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ receivables: [LIST_ROW] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.recordPayment('m-1', { amount: 28720 });
    });

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/payments'));
    expect(call).toBeTruthy();
    const sent = JSON.parse(String((call?.[1] as RequestInit).body));
    // This wire, not the new total — the addition belongs to the database.
    expect(sent.amount).toBe(28720);
    expect(outcome?.success).toBe(true);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reports a failure rather than guessing when the response carries no total', async () => {
    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { useReceivables } = await import('@/lib/hooks/useReceivables');

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes('/payments')
          ? new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify({ receivables: [LIST_ROW] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
      )
    );

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.recordPayment('m-1', { amount: 100 });
    });

    expect(outcome?.success).toBe(false);

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sumDeclaredPayments,
  normalizePaymentSource,
  recordMilestonePayment,
  PAYMENT_SOURCES,
} from '@/lib/milestonePayments';

/**
 * Payments are rows now (#381, option B).
 *
 * The defect this closes is not a crash. `POST /api/receivables/public/[token]`
 * wrote the payer's declaration straight into `milestones.transferred_amount`,
 * **replacing** whatever was there. One declaration per cobro and that is
 * correct. Two, and the second erases the first:
 *
 *   after a $20,000 wire        transferred_amount = 20,000  → $28,720 owed ✅
 *   after declaring $28,720     transferred_amount = 28,720  → $20,000 owed ❌
 *
 * The cobro is paid in full and reads as permanently short by exactly the first
 * payment, with nothing erroring — the owner has to notice a number.
 *
 * Why it was invisible: **every test in this area fed a single declaration.**
 * That is #146's lesson (a layer-by-layer suite cannot see a defect between the
 * layers) in its money-path form, so the load-bearing cases below declare twice
 * against one milestone.
 *
 * The first draft of the fix derived the new total from the ledger. Money-path
 * and database review both found that this reintroduced the defect for any
 * cobro an owner had touched — `PUT /api/receivables/[id]` writes the column
 * and no ledger row — plus two torn-write failure modes. The addition now
 * happens on the row inside `record_milestone_payment`, and the fake below
 * implements *that* function's semantics rather than the route's old sequence.
 */

// ---------------------------------------------------------------------------
// A fake that behaves like the SQL, including the parts that are easy to get
// wrong: the claim's status filter, the organization scope, `transferred_amount
// + amount` on the row, and rollback — a refused claim leaves no ledger row.
// ---------------------------------------------------------------------------
interface MilestoneRow {
  id: string;
  organization_id: string;
  status: string;
  amount: number;
  transferred_amount: number | null;
  tracking_reference: string | null;
  receipt_url: string | null;
  due_date: string;
}

interface PaymentRow {
  milestone_id: string;
  organization_id: string;
  amount: number;
  source: string;
  tracking_reference: string | null;
  receipt_url: string | null;
}

const db: {
  milestones: MilestoneRow[];
  payments: PaymentRow[];
  rpcError: { code: string; message: string } | null;
} = { milestones: [], payments: [], rpcError: null };

function resetDb() {
  db.milestones = [
    {
      id: 'milestone-1',
      organization_id: 'org-1',
      status: 'pending',
      amount: 48720,
      transferred_amount: null,
      tracking_reference: null,
      receipt_url: null,
      due_date: '2026-09-01',
    },
  ];
  db.payments = [];
  db.rpcError = null;
}

/** `record_milestone_payment`, in JS. One transaction: all effects or none. */
function callRecordMilestonePayment(args: Record<string, unknown>) {
  if (db.rpcError) return { data: null, error: db.rpcError };

  const amount = Number(args.p_amount);
  const milestone = db.milestones.find(
    (m) =>
      m.id === args.p_milestone_id &&
      m.organization_id === args.p_organization_id &&
      ['pending', 'requested'].includes(m.status)
  );

  // NOT FOUND → NULL, and nothing else happens. This is what stops a refused
  // duplicate from leaving a phantom payment behind.
  if (!milestone) return { data: null, error: null };

  // The unique index on (milestone_id, tracking_reference) for payer
  // declarations: the same clave de rastreo twice is a replay, not a payment.
  const replay = db.payments.some(
    (p) =>
      p.milestone_id === milestone.id &&
      p.source === 'payer_declaration' &&
      args.p_source === 'payer_declaration' &&
      p.tracking_reference !== null &&
      p.tracking_reference === args.p_tracking_reference
  );
  if (replay) return { data: null, error: { code: '23505', message: 'duplicate key' } };

  milestone.status = 'marked_paid';
  milestone.tracking_reference = (args.p_tracking_reference as string) ?? null;
  if (args.p_receipt_url != null) milestone.receipt_url = args.p_receipt_url as string;
  milestone.transferred_amount = Math.round(((milestone.transferred_amount ?? 0) + amount) * 100) / 100;

  db.payments.push({
    milestone_id: milestone.id,
    organization_id: milestone.organization_id,
    amount,
    source: args.p_source as string,
    tracking_reference: (args.p_tracking_reference as string) ?? null,
    receipt_url: (args.p_receipt_url as string) ?? null,
  });

  // PostgREST hands `numeric` back as a string. A number-only fixture never
  // proves the caller survives that.
  return { data: String(milestone.transferred_amount), error: null };
}

function makeClient() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'record_milestone_payment') throw new Error(`unexpected rpc ${name}`);
      return callRecordMilestonePayment(args);
    },
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'quote-1',
                  organization_id: 'org-1',
                  title: 'Suministro',
                  bank_account_id: null,
                  bank_accounts: null,
                  clients: { name: 'Distribuidora del Norte' },
                  organizations: {
                    name: 'Ferretería Cavazos',
                    bank_accounts: [
                      {
                        id: 'a1',
                        label: 'BBVA',
                        bank_name: 'BBVA',
                        clabe: '012180001234567899',
                        account_holder: 'Ferretería Cavazos',
                        is_default: true,
                        archived_at: null,
                      },
                    ],
                  },
                  contracts: {
                    id: 'contract-1',
                    title: 'Suministro',
                    // The GET reads the money columns; the POST reads only the
                    // selection ones. One fixture serves both, so a select that
                    // drops a money column shows up as a wrong number here.
                    milestones: db.milestones.map((m) => ({
                      id: m.id,
                      label: 'Anticipo 50%',
                      amount: m.amount,
                      transferred_amount: m.transferred_amount,
                      cfdi_total: null,
                      cfdi_status: 'none',
                      status: m.status,
                      due_date: m.due_date,
                    })),
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  isDemoDeployment: () => false,
  createServiceClient: () => makeClient(),
}));

beforeEach(() => {
  resetDb();
});

describe('sumDeclaredPayments', () => {
  it('sums a ledger PostgREST returned as strings', () => {
    expect(sumDeclaredPayments([{ amount: '20000' }, { amount: '28720' }])).toBe(48720);
  });

  it('is 0 for an empty or absent ledger', () => {
    expect(sumDeclaredPayments([])).toBe(0);
    expect(sumDeclaredPayments(null)).toBe(0);
    expect(sumDeclaredPayments(undefined)).toBe(0);
  });

  it('rounds to centavos rather than carrying float drift', () => {
    expect(sumDeclaredPayments([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });

  it('skips a row it cannot read instead of returning NaN', () => {
    // "$NaN" next to a CLABE is worse than a total short by a row nothing could
    // read — and the CHECK constraint refuses these anyway.
    expect(sumDeclaredPayments([{ amount: 20000 }, { amount: null }, { amount: 'abc' }])).toBe(
      20000
    );
    expect(sumDeclaredPayments([{ amount: 20000 }, { amount: -5 }, { amount: 0 }])).toBe(20000);
  });
});

describe('normalizePaymentSource', () => {
  it('accepts exactly the vocabulary the CHECK constraint enforces', () => {
    for (const source of PAYMENT_SOURCES) {
      expect(normalizePaymentSource(source)).toBe(source);
    }
  });

  it('answers null for an unrecognised value rather than the nearest listed', () => {
    // #95/#116: mapping an unknown value to the closest known one is how a
    // `free` plan displayed as a $299 tier, and how a Checkout Session's
    // `complete` reached a CHECK that rejects it — after the write was claimed.
    expect(normalizePaymentSource('payer')).toBeNull();
    expect(normalizePaymentSource('PAYER_DECLARATION')).toBeNull();
    expect(normalizePaymentSource('')).toBeNull();
    expect(normalizePaymentSource(undefined)).toBeNull();
    expect(normalizePaymentSource(42)).toBeNull();
  });
});

describe('recordMilestonePayment', () => {
  it('adds to the milestone and answers with the total the database computed', async () => {
    db.milestones[0].transferred_amount = 20000;

    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 28720,
      source: 'payer_declaration',
      trackingReference: 'REF-2',
    });

    expect(result).toEqual({ ok: true, total: 48720 });
  });

  it('refuses a milestone belonging to another organization', async () => {
    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-2',
      amount: 100,
      source: 'payer_declaration',
    });

    expect(result).toEqual({ ok: false, reason: 'not_payable' });
    expect(db.payments).toHaveLength(0);
  });

  it('refuses a non-positive amount before touching the database', async () => {
    for (const amount of [0, -1, Number.NaN]) {
      const result = await recordMilestonePayment({
        supabase: makeClient(),
        milestoneId: 'milestone-1',
        organizationId: 'org-1',
        amount,
        source: 'payer_declaration',
      });
      expect(result.ok).toBe(false);
    }
    expect(db.payments).toHaveLength(0);
  });

  it('refuses a source the CHECK constraint would reject, before the write', async () => {
    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: 'whatever' as any,
    });

    expect(result.ok).toBe(false);
    expect(db.payments).toHaveLength(0);
  });

  it('reports a failed write rather than a total', async () => {
    // `42P01` is the shape of the deploy-before-migrate window: Vercel ships
    // `main` and migrations are applied by hand (hard rule #6), so the table
    // may not exist yet on the deployment serving this request.
    db.rpcError = { code: '42P01', message: 'relation "milestone_payments" does not exist' };

    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      source: 'payer_declaration',
    });

    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    // Nothing was claimed either — that is the point of one transaction.
    expect(db.milestones[0].status).toBe('pending');
    expect(db.milestones[0].transferred_amount).toBeNull();
  });
});

describe('POST /api/receivables/public/[token] — two declarations (#381)', () => {
  async function declare(amount: number, reference: string) {
    const { POST } = await import('@/app/api/receivables/public/[token]/route');
    const response = await POST(
      new Request('http://localhost/api/receivables/public/tok', {
        method: 'POST',
        body: JSON.stringify({ tracking_reference: reference, transferred_amount: amount }),
      }),
      { params: Promise.resolve({ token: 'tok' }) }
    );
    return { status: response.status, body: await response.json() };
  }

  it('adds the second declaration to the first instead of replacing it', async () => {
    const first = await declare(20000, 'REF-1');
    expect(first.status).toBe(200);
    expect(db.milestones[0].transferred_amount).toBe(20000);

    // The owner leaves the cobro open for the balance — the flow the whole
    // decision exists to support.
    db.milestones[0].status = 'requested';

    const second = await declare(28720, 'REF-2');
    expect(second.status).toBe(200);

    // The assertion that fails on `main`: it read 28720 there, the cobro
    // showing $20,000 still owed on a debt paid in full.
    expect(db.milestones[0].transferred_amount).toBe(48720);
    expect(db.payments.map((p) => p.amount)).toEqual([20000, 28720]);
  });

  it('adds to a figure the OWNER recorded, which no ledger row covers', async () => {
    // The case that sank the first fix. `PUT /api/receivables/[id]` writes
    // `transferred_amount` and no ledger row, so a total derived from the
    // ledger silently dropped the owner's wire — the exact defect this table
    // exists to close, reintroduced by the fix for it. Deriving the total from
    // the column instead is what makes this pass.
    db.milestones[0].transferred_amount = 20000;
    db.milestones[0].status = 'requested';
    expect(db.payments).toHaveLength(0);

    const result = await declare(28720, 'REF-2');

    expect(result.status).toBe(200);
    expect(db.milestones[0].transferred_amount).toBe(48720);
  });

  it('keeps both clave de rastreo values, one per payment', async () => {
    await declare(20000, 'REF-1');
    db.milestones[0].status = 'requested';
    await declare(28720, 'REF-2');

    // The milestone column can only hold the latest; the ledger is what makes
    // the first wire traceable at all after the second arrives.
    expect(db.payments.map((p) => p.tracking_reference)).toEqual(['REF-1', 'REF-2']);
    expect(db.milestones[0].tracking_reference).toBe('REF-2');
  });

  it('refuses a duplicate declaration without writing a phantom ledger row', async () => {
    await declare(20000, 'REF-1');
    const replay = await declare(20000, 'REF-1');

    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(db.payments).toHaveLength(1);
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('refuses a replayed clave de rastreo even on a reopened cobro', async () => {
    // The status guard cannot see this one: the owner reopened the milestone,
    // so a resubmitted form passes the claim and would double the total. The
    // partial unique index is what refuses it.
    await declare(20000, 'REF-1');
    db.milestones[0].status = 'requested';

    const replay = await declare(20000, 'REF-1');

    // 23505 reaches `publicDbWriteErrorResponse`, which already knows a unique
    // violation is a duplicate and answers 409 — so the payer is told the
    // declaration is already on file rather than being invited to try again.
    expect(replay.status).toBe(409);
    expect(db.payments).toHaveLength(1);
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('leaves nothing half-written when the payment cannot be recorded', async () => {
    // The first draft claimed the milestone and wrote the ledger separately, so
    // a failed insert left it `marked_paid` with no amount — and the retry the
    // message asks for answered "ya fue registrado" for a payment recorded
    // nowhere. One transaction is what removes that state.
    db.rpcError = { code: '42P01', message: 'relation "milestone_payments" does not exist' };

    const result = await declare(20000, 'REF-1');

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('RECEIPT_WRITE_FAILED');
    expect(result.body.success).toBeUndefined();
    expect(db.payments).toHaveLength(0);
    expect(db.milestones[0].status).toBe('pending');
    expect(db.milestones[0].tracking_reference).toBeNull();

    // And so the retry is a retry, not a dead end.
    db.rpcError = null;
    const retry = await declare(20000, 'REF-1');
    expect(retry.status).toBe(200);
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('refuses amounts numeric(12,2) cannot hold, with a 400 rather than a 500', async () => {
    // Verified against Postgres 16: 0.004 rounds to 0.00 and trips the CHECK,
    // and 1e10 overflows. Both used to reach the database.
    for (const amount of [0.004, 10_000_000_000, 1234.567]) {
      const result = await declare(amount, `REF-${amount}`);
      expect(result.status, `amount ${amount} should be refused up front`).toBe(400);
      expect(result.body.error.code).toBe('INVALID_TRANSFERRED_AMOUNT');
    }
    expect(db.payments).toHaveLength(0);
    expect(db.milestones[0].status).toBe('pending');
  });
});

describe('GET /api/receivables/public/[token] — the payer is asked for the remainder', () => {
  async function get() {
    const { GET } = await import('@/app/api/receivables/public/[token]/route');
    const response = await GET(new Request('http://localhost/api/receivables/public/tok'), {
      params: Promise.resolve({ token: 'tok' }),
    });
    return { status: response.status, body: await response.json() };
  }

  it('nets the recorded amount off the figure asked for, and says so', async () => {
    // Shipping the summing without this would have made the page *worse*: a
    // payer shown the full $48,720 on a cobro with $20,000 already recorded
    // would have declared it, and the new addition would total $68,720. The
    // two halves are one behaviour (#371 + #381).
    db.milestones[0].transferred_amount = 20000;

    const { status, body } = await get();

    expect(status).toBe(200);
    expect(body.milestone.amount).toBe(28720);
    expect(body.milestone.already_received).toBe(20000);
    expect(body.milestone.settlement_total).toBe(48720);
  });

  it('asks for the whole figure when nothing has been recorded', async () => {
    const { body } = await get();

    expect(body.milestone.amount).toBe(48720);
    expect(body.milestone.already_received).toBe(0);
  });
});

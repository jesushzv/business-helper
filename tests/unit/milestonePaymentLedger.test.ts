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
 * Why this was invisible: **every test in this area fed a single declaration.**
 * That is the #146 lesson (a layer-by-layer suite cannot see a defect between
 * the layers) in its money-path form, so the load-bearing case below declares
 * twice against one milestone and asserts the total, not the last write.
 */

// ---------------------------------------------------------------------------
// A fake PostgREST that actually stores rows.
//
// A mock returning a fixed total would pass whether the route summed the ledger
// or echoed its own input — the two are indistinguishable from one declaration,
// which is how this shipped. This one keeps state, so the second declaration
// reads back what the first left behind.
// ---------------------------------------------------------------------------
interface MilestoneRow {
  id: string;
  organization_id: string;
  status: string;
  amount: number;
  transferred_amount: number | null;
  tracking_reference: string | null;
  receipt_url: string | null;
  cfdi_total: number | null;
  cfdi_status: string | null;
  due_date: string;
  label: string;
}

interface PaymentRow {
  milestone_id: string;
  organization_id: string;
  amount: number;
  source: string;
  tracking_reference: string | null;
  receipt_url: string | null;
}

const db: { milestones: MilestoneRow[]; payments: PaymentRow[]; failInsert: boolean; failRead: boolean } = {
  milestones: [],
  payments: [],
  failInsert: false,
  failRead: false,
};

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
      cfdi_total: null,
      cfdi_status: 'none',
      due_date: '2026-09-01',
      label: 'Anticipo 50%',
    },
  ];
  db.payments = [];
  db.failInsert = false;
  db.failRead = false;
}

/** Minimal query builder covering exactly the chains the code under test uses. */
function makeClient() {
  return {
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'quote-1',
                  organization_id: 'org-1',
                  contracts: {
                    id: 'contract-1',
                    milestones: db.milestones.map((m) => ({
                      id: m.id,
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

      if (table === 'milestones') {
        return {
          update(patch: Record<string, unknown>) {
            const filters: { id?: string; statuses?: string[] } = {};
            const apply = () => {
              const matched = db.milestones.filter(
                (m) =>
                  (filters.id === undefined || m.id === filters.id) &&
                  (filters.statuses === undefined || filters.statuses.includes(m.status))
              );
              matched.forEach((m) => Object.assign(m, patch));
              return matched.map((m) => ({ id: m.id }));
            };

            const builder = {
              eq(_col: string, value: string) {
                filters.id = value;
                return builder;
              },
              in(_col: string, values: string[]) {
                filters.statuses = values;
                return builder;
              },
              select: async () => ({ data: apply(), error: null }),
              // The bare `await …update().eq()` form, which the total write uses.
              then(resolve: (v: { error: null }) => void) {
                apply();
                resolve({ error: null });
              },
            };
            return builder;
          },
        };
      }

      if (table === 'milestone_payments') {
        return {
          insert: async (row: PaymentRow) => {
            if (db.failInsert) return { error: { code: '23503', message: 'insert failed' } };
            db.payments.push(row);
            return { error: null };
          },
          select: () => {
            const filters: Record<string, string> = {};
            const builder = {
              eq(col: string, value: string) {
                filters[col] = value;
                return builder;
              },
              then(resolve: (v: { data: unknown; error: unknown }) => void) {
                if (db.failRead) {
                  resolve({ data: null, error: { message: 'read failed' } });
                  return;
                }
                const rows = db.payments
                  .filter(
                    (p) =>
                      (filters.milestone_id === undefined ||
                        p.milestone_id === filters.milestone_id) &&
                      (filters.organization_id === undefined ||
                        p.organization_id === filters.organization_id)
                  )
                  // PostgREST hands `numeric` back as a string; the sum has to
                  // survive that, which a number-only fixture never proves.
                  .map((p) => ({ amount: String(p.amount) }));
                resolve({ data: rows, error: null });
              },
            };
            return builder;
          },
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
    // "$NaN" next to a CLABE is worse than a total that is short by a row
    // nothing could read — and the CHECK constraint refuses these anyway.
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
    expect(normalizePaymentSource('')).toBeNull();
    expect(normalizePaymentSource(undefined)).toBeNull();
    expect(normalizePaymentSource(42)).toBeNull();
  });
});

describe('recordMilestonePayment', () => {
  it('appends a row and answers with the ledger read back, not its own input', async () => {
    const client = makeClient();
    db.payments.push({
      milestone_id: 'milestone-1',
      organization_id: 'org-1',
      amount: 20000,
      source: 'payer_declaration',
      tracking_reference: 'REF-1',
      receipt_url: null,
    });

    const result = await recordMilestonePayment({
      supabase: client,
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 28720,
      source: 'payer_declaration',
      trackingReference: 'REF-2',
    });

    expect(result).toEqual({ ok: true, total: 48720 });
    expect(db.payments).toHaveLength(2);
  });

  it('scopes the total to the milestone and the organization', async () => {
    const client = makeClient();
    db.payments.push({
      milestone_id: 'other-milestone',
      organization_id: 'org-1',
      amount: 999999,
      source: 'payer_declaration',
      tracking_reference: null,
      receipt_url: null,
    });

    const result = await recordMilestonePayment({
      supabase: client,
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      source: 'payer_declaration',
    });

    expect(result).toEqual({ ok: true, total: 100 });
  });

  it('refuses a non-positive amount before touching the database', async () => {
    const client = makeClient();
    for (const amount of [0, -1, Number.NaN]) {
      const result = await recordMilestonePayment({
        supabase: client,
        milestoneId: 'milestone-1',
        organizationId: 'org-1',
        amount,
        source: 'payer_declaration',
      });
      expect(result.ok).toBe(false);
    }
    expect(db.payments).toHaveLength(0);
  });

  it('refuses a source the CHECK constraint would reject, before the insert', async () => {
    const client = makeClient();
    const result = await recordMilestonePayment({
      supabase: client,
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: 'whatever' as any,
    });

    expect(result.ok).toBe(false);
    expect(db.payments).toHaveLength(0);
  });

  it('reports a failed insert instead of a total', async () => {
    db.failInsert = true;
    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      source: 'payer_declaration',
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('total');
  });

  it('refuses to invent a total when the read-back fails', async () => {
    db.failRead = true;
    const result = await recordMilestonePayment({
      supabase: makeClient(),
      milestoneId: 'milestone-1',
      organizationId: 'org-1',
      amount: 100,
      source: 'payer_declaration',
    });

    // The row is in — but answering with "100" would be a figure computed from
    // what the code believes it wrote rather than from the rows (#128).
    expect(result.ok).toBe(false);
    expect(db.payments).toHaveLength(1);
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
    // decision exists to support. Without it the status guard refuses the
    // second declaration and the defect stays unreachable from this route.
    db.milestones[0].status = 'requested';

    const second = await declare(28720, 'REF-2');
    expect(second.status).toBe(200);

    // The assertion that fails on `main`: it read 28720 there, the cobro
    // showing $20,000 still owed on a debt paid in full.
    expect(db.milestones[0].transferred_amount).toBe(48720);
    expect(db.payments.map((p) => p.amount)).toEqual([20000, 28720]);
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

    // The status guard rejects it — and because the claim is written before the
    // ledger insert, the refused declaration leaves no payment behind.
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(db.payments).toHaveLength(1);
    expect(db.milestones[0].transferred_amount).toBe(20000);
  });

  it('reports failure rather than a confirmation when the ledger write fails', async () => {
    db.failInsert = true;
    const result = await declare(20000, 'REF-1');

    // Nothing recorded what the payer declared. Telling them "Comprobante
    // enviado correctamente" here is the #58/#86 fabricated confirmation this
    // page has already shipped once.
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('RECEIPT_WRITE_FAILED');
    expect(result.body.success).toBeUndefined();
    expect(db.payments).toHaveLength(0);
  });
});

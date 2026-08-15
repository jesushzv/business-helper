import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordedTransferAmount,
  outstandingAmount,
  expectedSettlementAmount,
  collectedAmount,
} from '@/lib/receivablesCalculator';
import { pickPayableMilestone } from '@/lib/publicReceivable';

/**
 * `/pay/[token]` tells a payer what has already arrived (#371).
 *
 * The issue's proposed fix was to swap `expectedSettlementAmount` for
 * `outstandingAmount` at the route's `amount`. Probing it first — per the rule
 * that an enumeration is a starting point, not an inventory — that swap is a
 * **no-op**, and the first describe below is the proof kept in the suite:
 * `pickPayableMilestone` only ever returns a `pending`/`requested` milestone,
 * `collectedAmount` returns 0 for anything not `confirmed`, so the two
 * functions are identical over every row this route can serve.
 *
 * What is real is the disclosure, and the fully-covered case. What is
 * deliberately *not* done is asking for the remainder: the route's POST
 * overwrites `transferred_amount` rather than adding to it, so a payer
 * declaring the balance would erase the record of the first wire. That is a
 * money-path decision, filed separately rather than taken in passing.
 */

/**
 * `transferred_amount` is required-and-nullable here, mirroring `CollectedBase`
 * rather than being made optional for the fixtures' convenience. That
 * obligation is the #351 fix — an optional field lets a fixture omit the column
 * and still typecheck, which is the shape that let a $20,000 wire read as
 * $48,720 collected. Vitest strips types, so only `tsc` catches a drift here.
 */
interface MockMilestone {
  id: string;
  label?: string;
  amount?: number;
  transferred_amount: number | string | null;
  cfdi_total?: number | null;
  cfdi_status?: string | null;
  due_date?: string;
  status?: string;
}

const state: { milestones: MockMilestone[] } = { milestones: [] };

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  // Vitest leaves NEXT_PUBLIC_SUPABASE_URL unset, which the real function reads
  // as the sandbox — and the sandbox serves its fixture instead of the logic
  // under test (#259's gate).
  isDemoDeployment: () => false,
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'quote-1',
              organization_id: 'org-1',
              title: 'Suministro',
              contracts: { id: 'contract-1', title: 'Suministro', milestones: state.milestones },
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
              bank_accounts: null,
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

async function getPayload(milestones: MockMilestone[]) {
  state.milestones = milestones;
  const { GET } = await import('@/app/api/receivables/public/[token]/route');
  const response = await GET(new Request('http://localhost/api/receivables/public/tok-1'), {
    params: Promise.resolve({ token: 'tok-1' }),
  });
  return { status: response.status, body: await response.json() };
}

const OPEN: MockMilestone = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 48720,
  transferred_amount: null,
  cfdi_total: null,
  cfdi_status: 'none',
  due_date: '2026-09-15',
  status: 'pending',
};

beforeEach(() => {
  vi.resetModules();
  state.milestones = [];
});

describe('why #371 needed a new figure rather than outstandingAmount', () => {
  it('outstandingAmount equals the full settlement for every payable status', () => {
    for (const status of ['pending', 'requested']) {
      const milestone = { ...OPEN, transferred_amount: 20000, status };

      // The row really is one this route would serve…
      expect(pickPayableMilestone([milestone])).toBeTruthy();
      // …and over it, the swap the issue proposed changes nothing.
      expect(collectedAmount(milestone)).toBe(0);
      expect(outstandingAmount(milestone)).toBe(expectedSettlementAmount(milestone));
      expect(outstandingAmount(milestone)).toBe(48720);
    }
  });

  it('a partially-confirmed cobro is not payable through the link at all', () => {
    // The adjacent defect this pinning exposes: once the owner confirms a short
    // wire, `pickPayableMilestone` refuses the row and the remainder can never
    // be paid through the product. Filed separately; recorded here so the next
    // session does not rediscover it from scratch.
    const confirmed = { ...OPEN, transferred_amount: 20000, status: 'confirmed' };
    expect(pickPayableMilestone([confirmed])).toBeNull();
    expect(outstandingAmount(confirmed)).toBe(28720);
  });
});

describe('recordedTransferAmount', () => {
  it('reports what the owner logged against a still-open cobro', () => {
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: 20000 })).toBe(20000);
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: '20000.50' })).toBe(20000.5);
  });

  it('treats an unset, null, zero or nonsense figure as nothing received', () => {
    expect(recordedTransferAmount(OPEN)).toBe(0);
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: 0 })).toBe(0);
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: -5 })).toBe(0);
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: 'no es un número' })).toBe(0);
    // The key absent entirely — a caller whose select omitted the column. The
    // cast is the point: `CollectedBase` refuses this shape at compile time,
    // and this asserts the runtime answer is still 0 rather than the full
    // amount, so the guard degrades to "nothing arrived" instead of
    // overstating (the direction `collectedAmount` cannot take, #351).
    const { transferred_amount: _omitted, ...withoutKey } = OPEN;
    expect(recordedTransferAmount(withoutKey as unknown as MockMilestone)).toBe(0);
  });

  it('clamps to the settlement figure and follows the stamped total', () => {
    expect(recordedTransferAmount({ ...OPEN, transferred_amount: 99999 })).toBe(48720);
    // `cfdi_total` governs once stamped (#341), so the clamp moves with it.
    expect(
      recordedTransferAmount({
        ...OPEN,
        transferred_amount: 48720,
        cfdi_total: 48719.99,
        cfdi_status: 'issued',
      })
    ).toBe(48719.99);
  });
});

describe('GET /api/receivables/public/[token] discloses what arrived', () => {
  it('serves already_received alongside the full amount, not netted off it', async () => {
    const { status, body } = await getPayload([{ ...OPEN, transferred_amount: 20000 }]);

    expect(status).toBe(200);
    // The asked-for figure is deliberately unchanged — see the route comment.
    expect(body.milestone.amount).toBe(48720);
    expect(body.milestone.already_received).toBe(20000);
  });

  it('reports zero rather than omitting the key when nothing has arrived', async () => {
    const { body } = await getPayload([OPEN]);

    // "The column was never selected" and "nothing arrived" are different
    // facts; the page must not have to guess which it is holding (#351).
    expect(body.milestone).toHaveProperty('already_received');
    expect(body.milestone.already_received).toBe(0);
  });

  it('refuses a cobro the business has already recorded as fully covered', async () => {
    const { status, body } = await getPayload([{ ...OPEN, transferred_amount: 48720 }]);

    expect(status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_SETTLED');
    // Spanish, safe to render verbatim, and it tells the payer what to do.
    expect(body.error.message).toMatch(/no transfieras de nuevo/i);
    // Never a payment request for nothing.
    expect(body.milestone).toBeUndefined();
  });

  it('still serves the cobro when more is owed than has arrived', async () => {
    const { status, body } = await getPayload([{ ...OPEN, transferred_amount: 48719.99 }]);

    expect(status).toBe(200);
    expect(body.milestone.already_received).toBe(48719.99);
  });

  it('does not refuse a cobro whose amount is unknown', async () => {
    // A $0 settlement figure with $0 recorded must not read as "covered" — the
    // guard is about money that arrived, not about a row with no amount.
    const { status } = await getPayload([{ ...OPEN, amount: 0 }]);
    expect(status).toBe(200);
  });
});

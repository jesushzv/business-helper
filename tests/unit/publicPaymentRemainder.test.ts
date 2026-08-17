import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickPayableMilestone } from '@/lib/publicReceivable';
import { remainingToRecord, outstandingAmount } from '@/lib/receivablesCalculator';

/**
 * Paying a cobro in two goes (#382, #371).
 *
 * The question every case here asks is the client's: *I wired part of this and
 * told them so — can I still send the rest?* Until now the answer was no. The
 * declaration moved the milestone to `marked_paid`, `pickPayableMilestone`
 * filtered on `pending`/`requested`, and the same `/pay/` link answered 409
 * "este cobro ya fue registrado" forever — while Cobranza went on showing the
 * balance as owed, correctly, with no path through the product to collect it.
 *
 * The predicate now asks about the **balance** rather than the status. What
 * that must not cost: a `confirmed` row still cannot be served (the confirmed
 * evidence is not something a replayed declaration may overwrite), and a cobro
 * already covered still gets a refusal rather than a $0 payment request.
 */

interface MockMilestone {
  id: string;
  label?: string;
  amount?: number;
  /** Required-and-nullable, mirroring `CollectedBase` — an optional field lets a
   *  fixture omit the column and still typecheck, which is #351's shape. */
  transferred_amount: number | string | null;
  cfdi_total?: number | null;
  cfdi_status?: string | null;
  due_date?: string;
  status?: string;
}

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const state: {
  milestones: MockMilestone[];
  rpcResult: unknown;
  rpcError: { code: string; message: string; details?: string } | null;
} = {
  milestones: [],
  rpcResult: 48720,
  rpcError: null,
};

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: state.rpcResult, error: null };
    },
  }),
}));

const ANTICIPO: MockMilestone = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 48720,
  transferred_amount: null,
  cfdi_total: null,
  cfdi_status: 'none',
  due_date: '2026-09-15',
  status: 'pending',
};

/** The scenario the issue is written around: $20,000 of $48,720 wired and declared. */
const HALF_DECLARED: MockMilestone = {
  ...ANTICIPO,
  transferred_amount: 20000,
  status: 'marked_paid',
};

async function get(milestones: MockMilestone[]) {
  state.milestones = milestones;
  const { GET } = await import('@/app/api/receivables/public/[token]/route');
  const response = await GET(new Request('http://localhost/api/receivables/public/tok-1'), {
    params: Promise.resolve({ token: 'tok-1' }),
  });
  return { status: response.status, body: await response.json() };
}

async function declare(milestones: MockMilestone[], body: Record<string, unknown>) {
  state.milestones = milestones;
  const { POST } = await import('@/app/api/receivables/public/[token]/route');
  const response = await POST(
    new Request('http://localhost/api/receivables/public/tok-1', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token: 'tok-1' }) }
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.resetModules();
  state.milestones = [];
  state.rpcResult = 48720;
  state.rpcError = null;
  rpcCalls.length = 0;
});

describe('the client who pays in two goes', () => {
  it('can still reach the cobro after declaring a partial wire', () => {
    // The whole defect in one assertion: this row was unreachable, and the
    // $28,720 on it was collectable only off-app.
    const selection = pickPayableMilestone([HALF_DECLARED]);

    expect(selection.milestone?.id).toBe('m-1');
    expect(selection.reason).toBeNull();
  });

  it('is asked for the remainder, and told why it is smaller', async () => {
    const { status, body } = await get([HALF_DECLARED]);

    expect(status).toBe(200);
    expect(body.milestone.amount).toBe(28720);
    // Both figures disclosed, so a payer seeing a number smaller than their
    // contract can tell it from a discount or an error (#371).
    expect(body.milestone.already_received).toBe(20000);
    expect(body.milestone.settlement_total).toBe(48720);
  });

  it('records the remainder as a second payment rather than a replacement', async () => {
    const { status } = await declare([HALF_DECLARED], {
      tracking_reference: 'SPEI20260901222222',
      transferred_amount: 28720,
    });

    expect(status).toBe(200);
    // One RPC, carrying **this wire**, not a new total. The function adds it to
    // the column and appends its own ledger row — a total sent from here is
    // what erased the first payment before #381.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('record_milestone_payment');
    expect(rpcCalls[0].args.p_amount).toBe(28720);
    expect(rpcCalls[0].args.p_source).toBe('payer_declaration');
  });

  it('tells a double-submit the payment is recorded, not that it failed', async () => {
    // A clave de rastreo identifies one SPEI transfer, so the same one twice is
    // a replay — `uq_milestone_payments_declaration_reference` makes it 23505
    // and the transaction rolls back. This case became reachable by an ordinary
    // double-tap only once a declared cobro stayed payable: before, the status
    // filter refused the second attempt before it reached the INSERT.
    state.rpcError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint ' +
        '"uq_milestone_payments_declaration_reference"',
    };

    const { status, body } = await declare([HALF_DECLARED], {
      tracking_reference: 'SPEI20260901222222',
      transferred_amount: 28720,
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    // The words matter more than the code here. "No se pudo registrar el pago"
    // is what a payer who has already paid transfers *again* after reading.
    expect(body.error.message).toMatch(/no se registró dos veces/i);
    expect(body.error.message).not.toMatch(/no se pudo/i);
  });

  it('still reports a genuine ledger failure as a failure', async () => {
    // The neighbouring case's positive control: 23505 on some other constraint
    // is not a replay, and must not borrow the reassuring message. Hard rule #1
    // — never report a success the database refused.
    state.rpcError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "some_other_index"',
    };

    const { status, body } = await declare([HALF_DECLARED], {
      tracking_reference: 'SPEI20260901444444',
      transferred_amount: 28720,
    });

    expect(status).not.toBe(200);
    expect(body.error.message).not.toMatch(/no se registró dos veces/i);
  });

  it('may attach a receipt to the second wire too', async () => {
    // The upload route resolves the same milestone through the same predicate.
    // While it filtered on status, a payer who had declared once could not
    // attach the comprobante for the wire they were about to send.
    state.milestones = [HALF_DECLARED];
    const selection = pickPayableMilestone(state.milestones);
    expect(selection.milestone?.id).toBe('m-1');
  });
});

describe('what the widened predicate must not cost', () => {
  it('refuses a cobro already recorded as covered, and says so distinctly', async () => {
    const covered = { ...ANTICIPO, transferred_amount: 48720, status: 'marked_paid' };
    const { status, body } = await get([covered]);

    expect(status).toBe(409);
    // Not PAYMENT_ALREADY_RECORDED: "do not transfer again" is a different
    // instruction from "we have your comprobante", and a payer holding a
    // receipt for the balance needs the first one.
    expect(body.error.code).toBe('PAYMENT_ALREADY_SETTLED');
    expect(body.error.message).toMatch(/no transfieras de nuevo/i);
    expect(body.milestone).toBeUndefined();
  });

  it('refuses the declaration too, with the same code the page was shown', async () => {
    const covered = { ...ANTICIPO, transferred_amount: 48720, status: 'marked_paid' };
    const { status, body } = await declare([covered], {
      tracking_reference: 'SPEI20260901333333',
      transferred_amount: 1000,
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_SETTLED');
    // Nothing reached the ledger for a cobro this route refused.
    expect(rpcCalls).toHaveLength(0);
  });

  it('never serves a confirmed milestone, short or not', async () => {
    for (const transferred of [20000, 48720]) {
      const confirmed = { ...ANTICIPO, transferred_amount: transferred, status: 'confirmed' };
      expect(pickPayableMilestone([confirmed]).milestone).toBeNull();
    }

    // And the refusal is the "nothing open" one, not "already covered" — there
    // is a real balance on the first of those rows, which is why #382 stays
    // open for it.
    const short = { ...ANTICIPO, transferred_amount: 20000, status: 'confirmed' };
    expect(pickPayableMilestone([short]).reason).toBe('recorded');
    expect(outstandingAmount(short)).toBe(28720);

    const { status, body } = await get([short]);
    expect(status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
  });

  it('serves the earliest open cobro, not the partially-paid one behind it', () => {
    const later = { ...HALF_DECLARED, id: 'm-2', due_date: '2026-11-30' };
    const earlier = { ...ANTICIPO, id: 'm-1', due_date: '2026-09-15' };

    // Order of the embed is not order of the contract: PostgREST returns rows
    // unordered, and GET, POST and the upload must all pick the same one (#79).
    expect(pickPayableMilestone([later, earlier]).milestone?.id).toBe('m-1');
    expect(pickPayableMilestone([earlier, later]).milestone?.id).toBe('m-1');
  });

  it('does not call a cobro with no amount "covered"', async () => {
    // A zero settlement figure has a zero balance without a peso having
    // arrived. Answering "ya está cubierto, no transfieras de nuevo" there is a
    // claim about payments that never happened.
    const { status } = await get([{ ...ANTICIPO, amount: 0 }]);
    expect(status).toBe(200);
  });
});

describe('remainingToRecord is the base, and outstandingAmount is not', () => {
  it('answers the balance on a declared-but-unconfirmed cobro', () => {
    expect(remainingToRecord(HALF_DECLARED)).toBe(28720);
    // The trap this helper exists to avoid: `outstandingAmount` subtracts
    // `collectedAmount`, which is 0 on anything not yet `confirmed`, so it
    // returns the FULL amount for the very row that has been half paid.
    expect(outstandingAmount(HALF_DECLARED)).toBe(48720);
  });

  it('follows the stamped total, and never goes negative', () => {
    expect(
      remainingToRecord({
        ...HALF_DECLARED,
        cfdi_total: 48719.99,
        cfdi_status: 'issued',
      })
    ).toBe(28719.99);

    expect(remainingToRecord({ ...ANTICIPO, transferred_amount: 99999 })).toBe(0);
    expect(remainingToRecord(null)).toBe(0);
  });
});

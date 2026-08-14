import { describe, it, expect } from 'vitest';
import {
  expectedSettlementAmount,
  collectedAmount,
  outstandingAmount,
  calculateReceivablesSummary,
  type MilestoneItem,
} from '@/lib/receivablesCalculator';
import { planPaymentComplement } from '@/lib/complementoPago';
import { toMilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * One base for "what does this cobro have to be paid to be settled" (#341).
 *
 * Three places asked that question and two different answers came back. The
 * complement plan measured the balance against `cfdi_total` — the PAC
 * recomputes taxes from the pre-tax base, so its total can land a rounding
 * step away from the milestone amount — while the confirm modal prefilled
 * `amount` and this calculator measured collected/outstanding against `amount`
 * too.
 *
 * The gap is one centavo and it is not cosmetic. It surfaces as the product
 * giving Don Roberto an instruction about money that does not exist, and it
 * has two symmetric forms — which is why the fix is a shared base rather than
 * a patch at the modal:
 *
 *   - prefill `amount` over a lower `cfdi_total` → the client pays exactly
 *     what the modal proposed and trips the #81 overpayment notice: "aplica el
 *     excedente a otro cobro o devuélvelo a tu cliente", for $0.01.
 *   - prefill `cfdi_total` while the calculator still measures `amount` → the
 *     cobro is confirmed and *stays* in an aging bucket owing $0.01 forever,
 *     counted in `countPartial`.
 *
 * Both are pinned below, so neither can be reintroduced by fixing one side.
 */

const PPD_STAMPED = {
  cfdi_status: 'issued',
  cfdi_payment_method: 'PPD',
  cfdi_uuid: 'A1B2C3D4-0000-0000-0000-00000000FFFF',
};

describe('expectedSettlementAmount — the shared base (#341)', () => {
  it('prefers the PAC total over the contractual amount', () => {
    expect(expectedSettlementAmount({ amount: 10000, cfdi_total: 9999.99 })).toBe(9999.99);
  });

  it('falls back to the milestone amount when nothing was stamped', () => {
    // NULL for every milestone stamped before the column was recorded, and for
    // everything never stamped. Losing this fallback prefills a blank field on
    // every legacy cobro.
    expect(expectedSettlementAmount({ amount: 10000, cfdi_total: null })).toBe(10000);
    expect(expectedSettlementAmount({ amount: 10000 })).toBe(10000);
    expect(expectedSettlementAmount({ amount: 10000, cfdi_total: 0 })).toBe(10000);
  });

  it('reads a numeric column PostgREST handed back as a string', () => {
    expect(expectedSettlementAmount({ amount: '10000.00', cfdi_total: '9999.99' })).toBe(9999.99);
  });

  it('ignores a cancelled CFDI — a void document settles nothing', () => {
    expect(
      expectedSettlementAmount({ amount: 10000, cfdi_total: 9999.99, cfdi_status: 'cancelled' })
    ).toBe(10000);
  });

  it('is 0 for a milestone carrying no figure at all, rather than NaN', () => {
    expect(expectedSettlementAmount(null)).toBe(0);
    expect(expectedSettlementAmount({ amount: 'no es un número' })).toBe(0);
  });
});

describe('the complement plan and the prefill agree by construction (#341)', () => {
  const milestone = { ...PPD_STAMPED, amount: 10000, cfdi_total: 9999.99 };

  it('paying exactly the prefilled amount produces no overpayment', () => {
    const plan = planPaymentComplement(milestone, [], expectedSettlementAmount(milestone));

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.overpaidAmount).toBe(0);
    expect(plan.settles).toBe(true);
    expect(plan.remainingBalance).toBe(0);
  });

  it('the old prefill is what manufactured the centavo — pinning the mechanism', () => {
    // `milestone.amount` is exactly what SpeiConfirmModal used to default to.
    const plan = planPaymentComplement(milestone, [], milestone.amount);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.overpaidAmount).toBe(0.01);
  });

  it('a genuine overpayment is still reported in full', () => {
    const plan = planPaymentComplement(milestone, [], 12000);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    // Declared to the SAT: the balance. Reported to the tenant: everything
    // above it. Neither is rounded away (#81).
    expect(plan.amount).toBe(9999.99);
    expect(plan.overpaidAmount).toBe(2000.01);
  });

  it('a short payment still leaves a real balance owing', () => {
    const plan = planPaymentComplement(milestone, [], 4000);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.overpaidAmount).toBe(0);
    expect(plan.settles).toBe(false);
    expect(plan.remainingBalance).toBe(5999.99);
  });
});

describe('the receivable settles against the same base (#341)', () => {
  const confirmed: MilestoneItem = {
    id: 'm-cfdi',
    label: 'Anticipo 50%',
    amount: 10000,
    cfdi_total: 9999.99,
    due_date: '2026-01-15',
    status: 'confirmed',
    transferred_amount: 9999.99,
  };

  it('a cobro paid to the stamped total owes nothing afterwards', () => {
    // The mirror defect: measured against `amount` this returns 0.01, and the
    // cobro never leaves Cobranza.
    expect(collectedAmount(confirmed)).toBe(9999.99);
    expect(outstandingAmount(confirmed)).toBe(0);
  });

  it('counts it settled, not partially paid', () => {
    const summary = calculateReceivablesSummary([confirmed], '2026-02-01');

    expect(summary.countConfirmed).toBe(1);
    expect(summary.countPartial).toBe(0);
    expect(summary.totalPartialOutstanding).toBe(0);
    // A settled cobro is in no aging bucket, so it cannot read Atrasado.
    expect(summary.totalOverdue).toBe(0);
    expect(summary.countOverdue).toBe(0);
    expect(summary.totalConfirmed).toBe(9999.99);
  });

  it('still reports a genuinely short payment as partial', () => {
    const short: MilestoneItem = { ...confirmed, transferred_amount: 4000 };
    const summary = calculateReceivablesSummary([short], '2026-02-01');

    expect(outstandingAmount(short)).toBe(5999.99);
    expect(summary.countPartial).toBe(1);
    expect(summary.countConfirmed).toBe(0);
  });

  it('behaves exactly as before for a milestone with no stamped total', () => {
    const legacy: MilestoneItem = { ...confirmed, cfdi_total: null, transferred_amount: 10000 };

    expect(collectedAmount(legacy)).toBe(10000);
    expect(outstandingAmount(legacy)).toBe(0);
  });
});

describe('cfdi_total survives the flattening (#341, #78)', () => {
  it('carries through toMilestoneWithClient from a server-shaped row', () => {
    // Server-shaped, not a demo fixture: the fixtures are exactly where an
    // unmapped field hides, because they are the only rows that ever had it.
    // `/api/receivables` selects `*, contracts(...)`, so the milestone's own
    // columns arrive flat and the relations arrive nested.
    const row = {
      id: 'm-1',
      organization_id: 'org-1',
      contract_id: 'c-1',
      label: 'Anticipo 50%',
      amount: 10000,
      cfdi_total: 9999.99,
      cfdi_status: 'issued',
      due_date: '2026-09-15',
      status: 'marked_paid',
      transferred_amount: null,
      contracts: {
        title: 'Impermeabilización Nave Industrial',
        client_id: 'cl-1',
        clients: { id: 'cl-1', name: 'Constructora del Bajío', phone: '8112345678' },
        quotes: { public_token: 'tok-abc' },
      },
    };

    const flat = toMilestoneWithClient(row as Parameters<typeof toMilestoneWithClient>[0]);

    expect(flat.cfdi_total).toBe(9999.99);
    expect(flat.cfdi_status).toBe('issued');
    // The base the modal will prefill from, computed off the mapped row.
    expect(expectedSettlementAmount(flat)).toBe(9999.99);
    // And the flattening it already owned still works.
    expect(flat.client_name).toBe('Constructora del Bajío');
    expect(flat.public_token).toBe('tok-abc');
  });
});

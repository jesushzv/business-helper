import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planPaymentComplement } from '@/lib/complementoPago';

/**
 * Guards the obligation this change exists to discharge.
 *
 * `buildComplementoPagoPayload` was written, tested and never called, while
 * `/api/invoices/issue` happily accepted `paymentMethod: 'PPD'`. A PPD CFDI
 * declares the amount as still owed and obliges the taxpayer to file a payment
 * complement for every payment received; the product created that obligation
 * and had no way to meet it.
 *
 * The arithmetic below — is one owed, for how much, as which parcialidad — is
 * the part that must be right before a PAC is contacted at all.
 */

function read(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), 'utf8');
}

const PPD_INVOICE = {
  amount: 11600,
  cfdi_total: 11600,
  cfdi_status: 'issued',
  cfdi_payment_method: 'PPD',
  cfdi_uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
  cfdi_id: 'cfdi_1',
};

describe('planPaymentComplement — when a complement is owed', () => {
  it('owes the first parcialidad for the full balance of a fresh PPD invoice', () => {
    const plan = planPaymentComplement(PPD_INVOICE, []);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.installment).toBe(1);
    expect(plan.amount).toBe(11600);
    expect(plan.lastBalance).toBe(11600);
    expect(plan.remainingBalance).toBe(0);
    expect(plan.settles).toBe(true);
  });

  it('owes nothing for a PUE invoice, which already declares its own payment', () => {
    const plan = planPaymentComplement({ ...PPD_INVOICE, cfdi_payment_method: 'PUE' }, []);
    expect(plan).toMatchObject({ required: false, reason: 'not_ppd' });
  });

  it('flags an issued document whose method is unknown instead of assuming PUE', () => {
    // Decided on #213 (founder, 2026-08-13): null no longer reads as PUE.
    // Since the stale-claim adoption path landed, null can mean "recovered
    // document whose PAC listing omitted the field" — and waving a PPD
    // invoice through as PUE silently skips every complemento the SAT
    // requires. (Production was checked before the change: no issued
    // milestone carries a null method, so no legacy row regresses.)
    const plan = planPaymentComplement({ ...PPD_INVOICE, cfdi_payment_method: null }, []);
    expect(plan).toMatchObject({ required: false, reason: 'unknown_method' });
    if (!plan.required) {
      expect(plan.message).toMatch(/complemento/i);
      expect(plan.message).toMatch(/verifica/i);
    }
  });

  it('owes nothing when no CFDI was ever stamped', () => {
    const plan = planPaymentComplement(
      { ...PPD_INVOICE, cfdi_status: 'none', cfdi_uuid: null, cfdi_id: null },
      []
    );
    expect(plan).toMatchObject({ required: false, reason: 'not_stamped' });
  });

  it('owes nothing once the invoice has been cancelled at the SAT', () => {
    const plan = planPaymentComplement({ ...PPD_INVOICE, cfdi_status: 'cancelled' }, []);
    expect(plan).toMatchObject({ required: false, reason: 'cancelled' });
  });
});

describe('planPaymentComplement — partial payments', () => {
  it('advances the parcialidad and carries the outstanding balance forward', () => {
    const plan = planPaymentComplement(
      PPD_INVOICE,
      [{ installment: 1, amount: 5000, status: 'issued' }],
      4000
    );

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.installment).toBe(2);
    expect(plan.amount).toBe(4000);
    expect(plan.lastBalance).toBe(6600);
    expect(plan.remainingBalance).toBe(2600);
    expect(plan.settles).toBe(false);
  });

  it('defaults the payment to whatever is still outstanding', () => {
    const plan = planPaymentComplement(PPD_INVOICE, [
      { installment: 1, amount: 5000, status: 'issued' },
    ]);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.amount).toBe(6600);
    expect(plan.settles).toBe(true);
  });

  it('caps a payment larger than the balance instead of over-declaring it', () => {
    // ImpPagado may not exceed ImpSaldoAnt; the excess is not something a tax
    // document can absorb.
    const plan = planPaymentComplement(PPD_INVOICE, [], 20000);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.amount).toBe(11600);
    expect(plan.remainingBalance).toBe(0);
  });

  it('records what the clamp removed instead of discarding it (#81)', () => {
    // $20,000 arrived against an $11,600 balance: the complement declares
    // $11,600, and the $8,400 the tenant actually holds is a fact, not noise.
    const plan = planPaymentComplement(PPD_INVOICE, [], 20000);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.overpaidAmount).toBe(8400);
  });

  it('reports zero surplus for a payment that fits the balance (#81)', () => {
    const plan = planPaymentComplement(PPD_INVOICE, [], 5000);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.overpaidAmount).toBe(0);
  });

  it('persists the surplus on the complement row (#81)', () => {
    // The plan's number must reach the insert — a computed value nothing
    // stores is how the receivables bug felt from the user's side (#33).
    const source = readFileSync(join(process.cwd(), 'lib/complementoPago.ts'), 'utf8');
    expect(source).toMatch(/overpaid_amount:\s*plan\.overpaidAmount/);
  });

  it('stops asking once the invoice is settled', () => {
    const plan = planPaymentComplement(PPD_INVOICE, [
      { installment: 1, amount: 5000, status: 'issued' },
      { installment: 2, amount: 6600, status: 'issued' },
    ]);

    expect(plan).toMatchObject({ required: false, reason: 'settled' });
  });

  it('does not let a failed attempt consume a parcialidad or a balance', () => {
    // The obligation outlives the failure: the retry is still parcialidad 1 for
    // the whole amount.
    const plan = planPaymentComplement(PPD_INVOICE, [
      { installment: 1, amount: 11600, status: 'failed' },
    ]);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.installment).toBe(1);
    expect(plan.lastBalance).toBe(11600);
  });

  it('reads PostgREST string numerics as amounts', () => {
    const plan = planPaymentComplement(
      { ...PPD_INVOICE, cfdi_total: '11600.00' },
      [{ installment: 1, amount: '5000.00', status: 'issued' }]
    );

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.lastBalance).toBe(6600);
  });

  it('balances against the CFDI total rather than the milestone amount', () => {
    // The PAC recomputes taxes from the pre-tax base, so the document total can
    // differ from the milestone by a rounding step. The SAT reconciles against
    // the document.
    const plan = planPaymentComplement({ ...PPD_INVOICE, amount: 11600, cfdi_total: 11599.99 }, []);

    expect(plan.required).toBe(true);
    if (!plan.required) return;
    expect(plan.lastBalance).toBe(11599.99);
  });
});

describe('The complement is actually sent', () => {
  const confirmRoute = read('app', 'api', 'receivables', '[id]', 'confirm', 'route.ts');
  const complementRoute = read('app', 'api', 'invoices', '[id]', 'complement', 'route.ts');
  const issueRoute = read('app', 'api', 'invoices', 'issue', 'route.ts');
  const library = read('lib', 'complementoPago.ts');
  const migration = read(
    'supabase',
    'migrations',
    '20260807170000_cfdi_payment_complements.sql'
  );

  it('files the complement where the payment becomes known', () => {
    expect(confirmRoute).toContain("from '@/lib/complementoPago'");
    expect(confirmRoute).toContain('issuePaymentComplement(');
  });

  it('offers a manual path for a failed or out-of-band payment', () => {
    expect(complementRoute).toContain('issuePaymentComplement(');
    expect(complementRoute).toContain("hasCapability(role, 'issue_cfdi')");
  });

  it('stamps the complement through the PAC client, never a local helper', () => {
    expect(library).toContain("from './pacClient'");
    expect(library).toContain('stampInvoice(');
    expect(library).not.toMatch(/simulate/i);
  });

  it('records what the invoice was stamped as, so PPD is recognisable later', () => {
    expect(issueRoute).toContain('cfdi_payment_method: paymentMethod');
    expect(migration).toContain('cfdi_payment_method');
  });

  it('meters no folios — the tenant PAC bills the complement directly (#221)', () => {
    // BYOK: the platform account and its folio ledger are gone; the inverse of
    // this assertion passed against the pre-#221 tree, so the absence is real.
    expect(library).not.toContain('reserve_cfdi_folio');
    expect(library).not.toContain('release_cfdi_folio');
  });

  it('keys PAC idempotency on the parcialidad, not just the cobro', () => {
    // A retry after a timeout must not stamp the same payment twice, and the
    // second genuine payment must not be deduplicated into the first.
    expect(library).toContain('`complement:${milestoneId}:${plan.installment}`');
  });

  it('never fails the payment confirmation because the complement failed', () => {
    expect(confirmRoute).toContain('complementError');
    expect(confirmRoute).toContain('fileComplementIfOwed');
  });
});

describe('Payment complement migration', () => {
  const migration = read(
    'supabase',
    'migrations',
    '20260807170000_cfdi_payment_complements.sql'
  );

  it('gives the complement its own table, since a milestone models one CFDI', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.cfdi_payment_complements');
    expect(migration).toContain('installment integer NOT NULL');
    expect(migration).toContain('last_balance numeric(12,2) NOT NULL');
    expect(migration).toContain('remaining_balance numeric(12,2) NOT NULL');
  });

  it('scopes the table to the tenant', () => {
    expect(migration).toContain(
      'ALTER TABLE public.cfdi_payment_complements ENABLE ROW LEVEL SECURITY;'
    );
    expect(migration).toContain('SELECT public.user_organization_ids()');
  });

  it('refuses two live complements for the same parcialidad', () => {
    expect(migration).toContain('idx_cfdi_complements_installment');
    expect(migration).toContain('(milestone_id, installment)');
  });

  it('keeps folios fiscales unique across complements too', () => {
    expect(migration).toContain('idx_cfdi_complements_uuid');
  });

  it('refuses a payment larger than the balance it settles', () => {
    expect(migration).toContain('amount <= last_balance');
  });
});

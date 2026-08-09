import { describe, it, expect } from 'vitest';
import { calculateClientCreditSummary, validateQuoteCreditLimit } from '@/lib/clientCredit';

describe('B2B Client Trade Credit & SAT PPD/CPP Invoicing Engine', () => {
  it('should accurately calculate used credit and available credit from pending receivables', () => {
    const client = { id: 'c_1', credit_limit: 50000, credit_days: 30, credit_status: 'active' as const };
    const receivables = [
      { clientId: 'c_1', amount: 15000, status: 'pending' },
      { clientId: 'c_1', amount: 10000, status: 'requested' },
      { clientId: 'c_1', amount: 5000, status: 'paid' },
    ];
    const summary = calculateClientCreditSummary(client, receivables);
    expect(summary.totalLimit).toBe(50000);
    expect(summary.usedCredit).toBe(25000);
    expect(summary.availableCredit).toBe(25000);
    expect(summary.utilizationPercentage).toBe(50);
    expect(summary.isOverLimit).toBe(false);
  });

  it('counts a payer-declared marked_paid as still owed — only owner confirmation releases credit', () => {
    // `marked_paid` is set by the unauthenticated public portal on the payer's
    // own declaration. Treating it as settled would let a client free their
    // credit line by declaring transfers the owner never received.
    const client = { id: 'c_1', credit_limit: 50000, credit_days: 30, credit_status: 'active' as const };
    const receivables = [
      { clientId: 'c_1', amount: 20000, status: 'marked_paid' },
      { clientId: 'c_1', amount: 10000, status: 'confirmed' },
    ];
    const summary = calculateClientCreditSummary(client, receivables);
    expect(summary.usedCredit).toBe(20000);
    expect(summary.availableCredit).toBe(30000);
  });

  it('should flag when quote total exceeds available credit', () => {
    const res = validateQuoteCreditLimit(30000, 20000, 'active');
    expect(res.isAllowed).toBe(true);
    expect(res.isExceeding).toBe(true);
    expect(res.warningMessage).toContain('excede el crédito disponible');
  });

  it('should block sales on credit for blocked clients', () => {
    const res = validateQuoteCreditLimit(5000, 10000, 'blocked');
    expect(res.isAllowed).toBe(false);
    expect(res.isExceeding).toBe(true);
    expect(res.warningMessage).toContain('bloqueado');
  });

  it('should issue warning for suspended credit clients', () => {
    const res = validateQuoteCreditLimit(5000, 10000, 'suspended');
    expect(res.isAllowed).toBe(true);
    expect(res.isExceeding).toBe(false);
    expect(res.warningMessage).toContain('suspendido');
  });
});

/**
 * Unknown is not zero (#96).
 *
 * `clients.credit_limit` is nullable with no default, so a client nobody has
 * assessed and a client deliberately authorized for $0 are different facts.
 * The summary used to collapse them — `Number(undefined) || 0` for the limit
 * and `credit_status || 'active'` for the status — so the detail page showed
 * every real tenant's client an authorized limit of $0 under a confident green
 * "Activo" badge, on the screen where the owner decides whether to extend more
 * credit. At the time the columns did not exist in production at all, so this
 * was the state of every client in the product.
 */
describe('an unconfigured credit line reads as unknown, not as zero', () => {
  const receivables = [{ clientId: 'c_1', amount: 12000, status: 'pending' }];

  it('reports isConfigured false when no limit is stored', () => {
    for (const client of [
      { id: 'c_1' },
      { id: 'c_1', credit_limit: null, credit_days: null, credit_status: null },
      { id: 'c_1', credit_limit: undefined },
    ]) {
      const summary = calculateClientCreditSummary(client, receivables);
      expect(summary.isConfigured, JSON.stringify(client)).toBe(false);
      // Never a green "Activo" the owner did not choose.
      expect(summary.status).toBeNull();
      expect(summary.creditDays).toBeNull();
      expect(summary.utilizationPercentage).toBe(0);
    }
  });

  it('still reports money genuinely owed, so the balance is not hidden', () => {
    const summary = calculateClientCreditSummary({ id: 'c_1' }, receivables);
    expect(summary.usedCredit).toBe(12000);
    // But not as headroom against a line that does not exist.
    expect(summary.availableCredit).toBe(0);
    expect(summary.isOverLimit).toBe(false);
  });

  it('distinguishes a deliberate zero limit from an unset one', () => {
    const deliberate = calculateClientCreditSummary(
      { id: 'c_1', credit_limit: 0, credit_days: 0, credit_status: 'active' },
      receivables
    );
    expect(deliberate.isConfigured).toBe(true);
    expect(deliberate.totalLimit).toBe(0);
    expect(deliberate.creditDays).toBe(0);
    expect(deliberate.status).toBe('active');

    const unset = calculateClientCreditSummary({ id: 'c_1' }, receivables);
    expect(unset.isConfigured).toBe(false);
  });

  it('does not invent a credit warning for a client with no credit policy', () => {
    const summary = calculateClientCreditSummary({ id: 'c_1' }, receivables);
    const res = validateQuoteCreditLimit(999999, summary.availableCredit, summary.status);
    expect(res.isAllowed).toBe(true);
    expect(res.isExceeding).toBe(false);
    expect(res.warningMessage).toBeNull();
  });

  it('keeps blocking a blocked client once a policy exists', () => {
    const summary = calculateClientCreditSummary(
      { id: 'c_1', credit_limit: 10000, credit_status: 'blocked' },
      receivables
    );
    expect(summary.isConfigured).toBe(true);
    expect(validateQuoteCreditLimit(500, summary.availableCredit, summary.status).isAllowed).toBe(
      false
    );
  });
});

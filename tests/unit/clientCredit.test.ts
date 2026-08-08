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

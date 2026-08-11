import { describe, it, expect } from 'vitest';
import {
  isLiveAccount,
  findDefaultAccount,
  selectableAccounts,
  resolveQuoteAccount,
  validateBankAccount,
  type BankAccount,
} from '@/lib/bankAccounts';

/**
 * #164 — several settlement accounts, chosen per quote.
 *
 * These pin the two rules real money depends on: a quote pays the account it
 * named rather than the current default, and a named account that has been
 * archived refuses instead of silently substituting another one.
 */

function account(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'acct-1',
    label: 'BBVA obra',
    bank_name: 'BBVA México',
    clabe: '012180001234567890',
    account_holder: 'Ferretería La Central',
    is_default: false,
    archived_at: null,
    ...overrides,
  };
}

describe('which account is live', () => {
  it('treats an account with no archived_at as live', () => {
    expect(isLiveAccount(account())).toBe(true);
  });

  it('treats an archived account as not live', () => {
    expect(isLiveAccount(account({ archived_at: '2026-08-11T00:00:00Z' }))).toBe(false);
  });

  it('treats a missing account as not live rather than throwing', () => {
    expect(isLiveAccount(null)).toBe(false);
    expect(isLiveAccount(undefined)).toBe(false);
  });
});

describe('the default account', () => {
  it('is the live row flagged is_default', () => {
    const wanted = account({ id: 'acct-2', is_default: true });
    expect(findDefaultAccount([account(), wanted])?.id).toBe('acct-2');
  });

  it('is null when the flagged row has been archived', () => {
    // The database forbids this combination, so it can only arrive through a
    // stale read — which must not resolve to an account money cannot reach.
    const archivedDefault = account({ is_default: true, archived_at: '2026-08-11T00:00:00Z' });
    expect(findDefaultAccount([archivedDefault])).toBeNull();
  });

  it('is null when the organization has no accounts at all', () => {
    expect(findDefaultAccount([])).toBeNull();
  });
});

describe('what a new quote may choose', () => {
  it('excludes archived accounts and puts the default first', () => {
    const list = [
      account({ id: 'z', label: 'Zafiro' }),
      account({ id: 'archived', label: 'Antigua', archived_at: '2026-08-01T00:00:00Z' }),
      account({ id: 'def', label: 'Principal', is_default: true }),
      account({ id: 'a', label: 'Alfa' }),
    ];

    expect(selectableAccounts(list).map((a) => a.id)).toEqual(['def', 'a', 'z']);
  });
});

describe('resolving the account a payer is sent to', () => {
  it('uses the account the quote named, not the current default', () => {
    // The tenant chose where this client's money lands. A later change of
    // default must not redirect an already-shared payment link.
    const named = account({ id: 'named' });
    const currentDefault = account({ id: 'other-default', is_default: true });

    const resolved = resolveQuoteAccount(named, currentDefault);

    expect(resolved).toMatchObject({ ok: true, source: 'quote' });
    expect(resolved.ok && resolved.account.id).toBe('named');
  });

  it('falls back to the default when the quote named no account', () => {
    // Every quote written before this feature is in exactly this state.
    const currentDefault = account({ id: 'def', is_default: true });

    const resolved = resolveQuoteAccount(null, currentDefault);

    expect(resolved).toMatchObject({ ok: true, source: 'default' });
    expect(resolved.ok && resolved.account.id).toBe('def');
  });

  it('refuses when the named account was archived — never substitutes another', () => {
    // The tenant archived it for a reason, a closed bank account being the
    // obvious one. Sending a payer there, or to an account nobody chose for
    // them, are both worse than refusing.
    const named = account({ id: 'named', archived_at: '2026-08-10T00:00:00Z' });
    const currentDefault = account({ id: 'def', is_default: true });

    expect(resolveQuoteAccount(named, currentDefault)).toEqual({ ok: false, reason: 'archived' });
  });

  it('refuses when there is no named account and no live default', () => {
    expect(resolveQuoteAccount(null, null)).toEqual({ ok: false, reason: 'none' });
  });

  it('refuses when the only default is archived', () => {
    const archivedDefault = account({ is_default: true, archived_at: '2026-08-10T00:00:00Z' });
    expect(resolveQuoteAccount(null, archivedDefault)).toEqual({ ok: false, reason: 'none' });
  });
});

describe('validating an account before it can receive money', () => {
  const valid = {
    label: 'BBVA obra',
    bankName: 'BBVA México',
    clabe: '0121 8000 1234 5678 99',
    accountHolder: ' Ferretería ',
  };

  it('accepts a well-formed account and normalizes it', () => {
    const result = validateBankAccount(valid);
    expect(result).toMatchObject({
      ok: true,
      value: { label: 'BBVA obra', bank_name: 'BBVA México', clabe: '012180001234567899' },
    });
    expect(result.ok && result.value.account_holder).toBe('Ferretería');
  });

  it('requires a label, since two 18-digit strings are indistinguishable by sight', () => {
    const result = validateBankAccount({ ...valid, label: '   ' });
    expect(result).toMatchObject({ ok: false, field: 'label' });
  });

  it('requires the bank name', () => {
    expect(validateBankAccount({ ...valid, bankName: '' })).toMatchObject({
      ok: false,
      field: 'bankName',
    });
  });

  it('rejects a CLABE that is not 18 digits', () => {
    expect(validateBankAccount({ ...valid, clabe: '01218000' })).toMatchObject({
      ok: false,
      field: 'clabe',
    });
  });

  it('rejects an 18-digit CLABE whose check digit fails (#66)', () => {
    expect(validateBankAccount({ ...valid, clabe: '012180001234567897' })).toMatchObject({
      ok: false,
      field: 'clabe',
    });
  });

  it('keys the failure by field so the form can point at the input', () => {
    // #146: a message the tenant must hunt for is not a message.
    const result = validateBankAccount({ ...valid, clabe: 'pendiente' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe('clabe');
    expect(result.ok === false && result.message).toMatch(/18 dígitos/);
  });

  it('treats an empty account holder as absent rather than as an empty string', () => {
    const result = validateBankAccount({ ...valid, accountHolder: '  ' });
    expect(result.ok && result.value.account_holder).toBeNull();
  });
});

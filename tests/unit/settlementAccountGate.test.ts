import { describe, it, expect, vi } from 'vitest';

/**
 * #64 — the settlement-account gate, over a list of accounts since #164.
 *
 * The public payment page already refuses without an account, but that refusal
 * fires in front of the paying client, after the link has been shared. These
 * tests pin the refusal one step earlier: on the server path that hands a
 * `/pay/` link to a client.
 *
 * The failure this guards against is not "a 409 is missing" — it is a tenant
 * spending their credibility on a link that dead-ends. "Ready" now means the
 * organization has at least one account that is not archived; the question is
 * unchanged, but a tenant with two banks can no longer be told they have none
 * because one column happens to be empty.
 */

import {
  hasSettlementAccount,
  requireSettlementAccount,
  SETTLEMENT_ACCOUNT_MISSING_CODE,
} from '@/lib/settlementAccount';
import type { BankAccount } from '@/lib/bankAccounts';

function account(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'acct-1',
    label: 'BBVA obra',
    bank_name: 'BBVA México',
    clabe: '012180001234567899',
    account_holder: null,
    is_default: true,
    archived_at: null,
    ...overrides,
  };
}

describe('hasSettlementAccount', () => {
  it('accepts an organization with one live account', () => {
    expect(hasSettlementAccount([account()])).toBe(true);
  });

  it('accepts an organization with several accounts', () => {
    expect(hasSettlementAccount([account(), account({ id: 'acct-2', is_default: false })])).toBe(true);
  });

  it('rejects an empty, null or missing list', () => {
    expect(hasSettlementAccount([])).toBe(false);
    expect(hasSettlementAccount(null)).toBe(false);
    expect(hasSettlementAccount(undefined)).toBe(false);
  });

  it('rejects an organization whose only account is archived', () => {
    // Archived accounts stay readable for the quotes that named them, but they
    // are not somewhere new money can be sent.
    expect(hasSettlementAccount([account({ archived_at: '2026-08-11T00:00:00Z' })])).toBe(false);
  });
});

/** Minimal Supabase double for `.from().select().eq().is()`, which resolves as a list. */
function supabaseReturning(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue({ error: null, ...result }),
  };
  return { from: vi.fn(() => chain), __chain: chain };
}

describe('requireSettlementAccount', () => {
  it('passes through the default account when the organization has one', async () => {
    const result = await requireSettlementAccount(
      supabaseReturning({ data: [account({ id: 'acct-default' })] }),
      'org-1'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.account.id).toBe('acct-default');
      expect(result.account.clabe).toBe('012180001234567899');
    }
  });

  it('prefers the default over another live account', async () => {
    const result = await requireSettlementAccount(
      supabaseReturning({
        data: [
          account({ id: 'secondary', is_default: false, label: 'Aaa first alphabetically' }),
          account({ id: 'primary', is_default: true }),
        ],
      }),
      'org-1'
    );

    expect(result.ok && result.account.id).toBe('primary');
  });

  it('refuses with 409 ORG_BANK_DETAILS_MISSING when there are no accounts', async () => {
    const result = await requireSettlementAccount(supabaseReturning({ data: [] }), 'org-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe(SETTLEMENT_ACCOUNT_MISSING_CODE);
    // Spanish, and it names the thing to fix rather than the error condition.
    expect(body.error.message).toMatch(/CLABE/);
  });

  it('refuses when every account is archived', async () => {
    const result = await requireSettlementAccount(
      supabaseReturning({ data: [account({ archived_at: '2026-08-11T00:00:00Z' })] }),
      'org-1'
    );
    expect(result.ok).toBe(false);
  });

  it('refuses when the lookup fails rather than assuming an empty list means ready', async () => {
    // Letting a payment link out on the strength of a query that did not run is
    // the fail-open half of this gate.
    const result = await requireSettlementAccount(
      supabaseReturning({ data: null, error: { message: 'boom' } }),
      'org-1'
    );
    expect(result.ok).toBe(false);
  });

  it('scopes the read to the caller organization and to live accounts', async () => {
    const supabase = supabaseReturning({ data: [account()] });

    await requireSettlementAccount(supabase, 'org-42');

    // An unscoped gate would answer for whichever tenant came back first.
    expect(supabase.__chain.eq).toHaveBeenCalledWith('organization_id', 'org-42');
    expect(supabase.__chain.is).toHaveBeenCalledWith('archived_at', null);
  });
});

/**
 * An organization with live accounts but **no default** (#164).
 *
 * `makeDefault` clears the current default before setting the new one — the
 * partial unique index forces two steps — so a failure between them leaves
 * exactly this state. This function used to answer it with `live[0]`, the
 * alphabetically first account, which is two defects at once: it names an
 * account nobody designated as the settlement target, and it disagrees with the
 * payer route, which resolves the same state through `resolveQuoteAccount(null,
 * null)` and refuses. That disagreement is #64's failure — the tenant's
 * dashboard stays clean and share buttons stay live while every quote that
 * named no account dead-ends in front of its client.
 */
describe('an organization with live accounts but no default', () => {
  function supabaseWith(accounts: unknown[]) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: async () => ({ data: accounts, error: null }),
    };
    return { from: () => builder };
  }

  const live = (id: string, label: string, is_default: boolean) => ({
    id,
    label,
    bank_name: 'BBVA México',
    clabe: '012180001234567899',
    account_holder: null,
    is_default,
    archived_at: null,
  });

  it('refuses rather than naming an account nobody designated', async () => {
    const result = await requireSettlementAccount(
      supabaseWith([live('a', 'Alfa', false), live('b', 'Beta', false)]),
      'org-1'
    );

    expect(result.ok).toBe(false);
  });

  it('answers with the flagged account when there is one', async () => {
    const result = await requireSettlementAccount(
      supabaseWith([live('a', 'Alfa', false), live('b', 'Beta', true)]),
      'org-1'
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.account.id).toBe('b');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { checkQuoteAccountOwnership } from '@/lib/bankAccounts';

/**
 * A quote may only name an account its own organization holds (#164).
 *
 * The FK on `quotes.bank_account_id` proves the row exists, not whose it is;
 * the quotes RLS policy scopes by the quote's `organization_id`, not by the
 * account it points at; and the public payer route reads through the **service
 * client**, embedding `bank_accounts!bank_account_id` and rendering whatever it
 * finds. So without this check a quote could carry another tenant's account id
 * and their bank name, CLABE and account holder would be printed on a payment
 * page the caller controls — and the payer would wire real money there.
 *
 * Adding `bank_account_id` to `QUOTE_WRITABLE_FIELDS` is what made that
 * reachable from a request body, which is why the check landed with it.
 */

/** Minimal supabase double: records the filters, answers with `row`. */
function supabaseReturning(row: unknown, error: unknown = null) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => builder, filters };
}

const LIVE = { id: 'acct-1', archived_at: null };

describe('checkQuoteAccountOwnership', () => {
  it('allows null — the quote settles at the organization default', async () => {
    const db = supabaseReturning(null);
    expect(await checkQuoteAccountOwnership(db, 'org-1', null)).toEqual({ ok: true });
    expect(await checkQuoteAccountOwnership(db, 'org-1', undefined)).toEqual({ ok: true });
  });

  it('allows an account the organization holds', async () => {
    const db = supabaseReturning(LIVE);
    expect(await checkQuoteAccountOwnership(db, 'org-1', 'acct-1')).toEqual({ ok: true });
  });

  /**
   * The lookup is scoped by organization as well as id, so it cannot even
   * confirm that another tenant's row exists.
   */
  it('scopes the lookup by organization, not by id alone', async () => {
    const db = supabaseReturning(LIVE);
    await checkQuoteAccountOwnership(db, 'org-1', 'acct-1');

    expect(db.filters).toEqual({ id: 'acct-1', organization_id: 'org-1' });
  });

  it("refuses another tenant's account", async () => {
    // Scoped by organization_id, so the other tenant's row simply is not found.
    const db = supabaseReturning(null);
    const result = await checkQuoteAccountOwnership(db, 'org-1', 'acct-belonging-to-org-2');

    expect(result).toMatchObject({ ok: false, status: 400, code: 'BANK_ACCOUNT_NOT_FOUND' });
  });

  it('refuses an archived account rather than quoting against it', async () => {
    const db = supabaseReturning({ id: 'acct-1', archived_at: '2026-08-01T00:00:00Z' });
    const result = await checkQuoteAccountOwnership(db, 'org-1', 'acct-1');

    expect(result).toMatchObject({ ok: false, status: 409, code: 'BANK_ACCOUNT_ARCHIVED' });
  });

  it('refuses a non-string id instead of passing it to the query', async () => {
    const db = supabaseReturning(LIVE);
    const result = await checkQuoteAccountOwnership(db, 'org-1', { id: 'acct-1' });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  /** A failed read is unknown; refusing is the safe direction on a money column. */
  it('refuses when the lookup itself failed, rather than assuming ownership', async () => {
    const db = supabaseReturning(null, { message: 'connection reset' });
    const result = await checkQuoteAccountOwnership(db, 'org-1', 'acct-1');

    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it('answers in Spanish, with no jargon a tenant would not recognise', async () => {
    const db = supabaseReturning(null);
    const result = await checkQuoteAccountOwnership(db, 'org-1', 'acct-9');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe('Esa cuenta de cobro no existe en tu negocio');
  });
});

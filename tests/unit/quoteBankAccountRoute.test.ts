import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The quote write routes must *call* the ownership check (#164).
 *
 * `quoteBankAccountOwnership.test.ts` proves the check answers correctly.
 * That is not the same claim: deleting the call from `POST /api/quotes`
 * entirely left it — and every other test — green, because nothing invoked the
 * handler. The defect lives in the seam, which is the shape #146 was written
 * about, so this calls the real handlers and asserts on what reaches the DB.
 *
 * The failure it holds shut: a quote naming another tenant's `bank_account_id`
 * is inserted, and the public payer route — which reads through the service
 * client and embeds `bank_accounts!bank_account_id` — prints that tenant's
 * bank name, CLABE and account holder on a payment page the caller controls,
 * where a real client wires real money.
 */

const insertCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<Record<string, unknown>> = [];

/** Accounts org-1 actually holds. Anything else must be refused. */
const OWN_ACCOUNTS: Record<string, { id: string; archived_at: string | null }> = {
  'acct-own': { id: 'acct-own', archived_at: null },
  'acct-own-archived': { id: 'acct-own-archived', archived_at: '2026-08-01T00:00:00Z' },
};

function bankAccountsTable() {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () => {
      // The real query is scoped by organization_id, so another tenant's row is
      // simply not visible here.
      if (filters.organization_id !== 'org-1') return { data: null, error: null };
      const row = OWN_ACCOUNTS[String(filters.id)];
      return { data: row ?? null, error: null };
    },
  };
  return builder;
}

function quotesTable() {
  return {
    // `PUT` reads the quote's own status before a content edit (#340): the
    // document is editable in `draft` and `sent` and nowhere else. A draft
    // keeps these assertions about the bank account.
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status: 'draft' }, error: null }) }),
      }),
    }),
    insert: (values: Record<string, unknown>) => {
      insertCalls.push(values);
      return {
        select: () => ({ single: async () => ({ data: { id: 'quote-1', ...values }, error: null }) }),
      };
    },
    update: (values: Record<string, unknown>) => {
      updateCalls.push(values);
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'quote-1', ...values }, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  // pickFields and QUOTE_WRITABLE_FIELDS must be the real ones.
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: {
          from: (table: string) => (table === 'bank_accounts' ? bankAccountsTable() : quotesTable()),
        },
      },
    })),
  };
});

const { POST } = await import('@/app/api/quotes/route');
const { PUT } = await import('@/app/api/quotes/[id]/route');

function postQuote(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Suministro', ...body }),
    })
  );
}

function putQuote(body: Record<string, unknown>) {
  return PUT(
    new Request('http://localhost/api/quotes/quote-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'quote-1' }) }
  );
}

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
});

describe('POST /api/quotes', () => {
  it('stores an account the organization holds', async () => {
    const res = await postQuote({ bank_account_id: 'acct-own' });

    expect(res.status).toBe(201);
    expect(insertCalls[0].bank_account_id).toBe('acct-own');
  });

  it('stores null when no account is named — settle at the default', async () => {
    const res = await postQuote({ bank_account_id: null });

    expect(res.status).toBe(201);
    expect(insertCalls[0].bank_account_id).toBeNull();
  });

  it("refuses another tenant's account, and writes nothing", async () => {
    const res = await postQuote({ bank_account_id: 'acct-belonging-to-org-2' });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('BANK_ACCOUNT_NOT_FOUND');
    // The quote must not exist at all: a row carrying a foreign account is the
    // thing the payer page would later render.
    expect(insertCalls).toHaveLength(0);
  });

  it('refuses an archived account of its own', async () => {
    const res = await postQuote({ bank_account_id: 'acct-own-archived' });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('BANK_ACCOUNT_ARCHIVED');
    expect(insertCalls).toHaveLength(0);
  });
});

describe('PUT /api/quotes/[id]', () => {
  it('re-points a quote at another account the organization holds', async () => {
    const res = await putQuote({ bank_account_id: 'acct-own' });

    expect(res.status).toBe(200);
    expect(updateCalls[0].bank_account_id).toBe('acct-own');
  });

  it("refuses to re-point a quote at another tenant's account", async () => {
    const res = await putQuote({ bank_account_id: 'acct-belonging-to-org-2' });

    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  /**
   * An edit that does not mention the account must not have to justify one:
   * `'bank_account_id' in updates` is the guard, so a title-only edit skips
   * the lookup instead of being refused for a column it never touched.
   */
  it('leaves the account alone on an edit that does not name it', async () => {
    const res = await putQuote({ title: 'Suministro corregido' });

    expect(res.status).toBe(200);
    expect(updateCalls[0]).not.toHaveProperty('bank_account_id');
  });
});

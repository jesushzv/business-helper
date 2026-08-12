import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The settlement-accounts routes themselves (#164).
 *
 * These had no route-level test: the capability gate, the `DEFAULT_ACCOUNT`
 * refusal and the clear-then-set ordering in `makeDefault` were exercised only
 * through component tests that **mock the route's responses** — i.e. they
 * assert the card renders what the route is assumed to return. Capability
 * gating on a money-moving route with no test of the gate itself is precisely
 * #32's setup.
 *
 * Every route here writes or reads where a tenant's SPEI lands, so the claims
 * worth pinning are: who may write, what is refused, and what the caller is
 * told when a write half-happens.
 */

type Row = Record<string, unknown>;

const state: {
  accounts: Row[];
  updates: Array<{ values: Row; filters: Row }>;
  inserts: Row[];
  audits: Row[];
  failSetDefault: boolean;
  /** Live quotes the exposure query (#196/#197) reads; 'fail' makes the read error. */
  quotes: Row[] | 'fail';
} = { accounts: [], updates: [], inserts: [], audits: [], failSetDefault: false, quotes: [] };

let currentRole = 'owner';

/**
 * A chainable `bank_accounts` double.
 *
 * Models enough PostgREST to take the routes down their real branches: the
 * `head: true` count POST uses to decide the first-account default, the list
 * DELETE uses to find other live accounts, `maybeSingle` reads, and updates
 * awaited with no `.select()`. A double that answers everything with `null`
 * silently sends every route down its "nothing exists" path, which is how a
 * route test ends up asserting the opposite of what it means to.
 */
function bankAccountsTable() {
  const filters: Row = {};
  let pending: Row | null = null;
  let wantsCount = false;

  const matching = () =>
    state.accounts.filter(
      (a) =>
        (filters.id === undefined || a.id === filters.id) &&
        (filters.organization_id === undefined || a.organization_id === filters.organization_id) &&
        (filters.is_default === undefined || a.is_default === filters.is_default) &&
        (filters.archived_at === undefined || a.archived_at === filters.archived_at) &&
        (filters.not_id === undefined || a.id !== filters.not_id)
    );

  const settle = () => {
    if (pending) {
      state.updates.push({ values: pending, filters: { ...filters } });
      if (state.failSetDefault && pending.is_default === true && filters.id === 'acct-2') {
        return { data: null, error: { code: '40001', message: 'write conflict' } };
      }
      const row = state.accounts.find((a) => a.id === filters.id);
      return { data: row ? { ...row, ...pending } : null, error: null };
    }
    if (wantsCount) return { count: matching().length, error: null };
    return { data: matching(), error: null };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantsCount = true;
      return proxy;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return proxy;
    },
    is: (column: string, value: unknown) => {
      filters[column] = value;
      return proxy;
    },
    neq: (column: string, value: unknown) => {
      filters[`not_${column}`] = value;
      return proxy;
    },
    order: () => proxy,
    update: (values: Row) => {
      pending = values;
      return proxy;
    },
    insert: (values: Row) => {
      pending = values;
      return proxy;
    },
    maybeSingle: async () => {
      const result = settle() as { data?: Row | Row[]; error: unknown };
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
      return { data, error: result.error };
    },
    single: async () => {
      state.inserts.push(pending as Row);
      return { data: { id: 'acct-new', ...(pending as Row) }, error: null };
    },
  };

  // Awaiting the builder itself — an update or a list read with no modifier.
  const proxy: Record<string, unknown> = new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => Promise.resolve(settle()).then(resolve);
      }
      return target[prop as string];
    },
  });

  return proxy;
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: currentRole,
        supabase: {
          from: (table: string) => {
            if (table === 'audit_logs') {
              return {
                insert: async (values: Row) => {
                  state.audits.push(values);
                  return { error: null };
                },
              };
            }
            if (table === 'quotes') {
              const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                not: () => builder,
                in: async () =>
                  state.quotes === 'fail'
                    ? { data: null, error: { message: 'boom' } }
                    : { data: state.quotes, error: null },
              };
              return builder;
            }
            return bankAccountsTable();
          },
        },
      },
    })),
  };
});

const { GET, POST } = await import('@/app/api/organization/bank-accounts/route');
const { PATCH, DELETE } = await import('@/app/api/organization/bank-accounts/[id]/route');

const VALID_CLABE = '012180001234567899';

function post(body: Row) {
  return POST(
    new Request('http://localhost/api/organization/bank-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

function patch(id: string, body: Row) {
  return PATCH(
    new Request(`http://localhost/api/organization/bank-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

function del(id: string) {
  return DELETE(
    new Request(`http://localhost/api/organization/bank-accounts/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

const account = (over: Row = {}): Row => ({
  id: 'acct-1',
  organization_id: 'org-1',
  label: 'BBVA obra',
  bank_name: 'BBVA México',
  clabe: VALID_CLABE,
  account_holder: null,
  is_default: true,
  archived_at: null,
  ...over,
});

beforeEach(() => {
  state.accounts = [account()];
  state.updates = [];
  state.inserts = [];
  state.audits = [];
  state.failSetDefault = false;
  state.quotes = [];
  currentRole = 'owner';
});

describe('the list names each account’s blast radius (#196/#197)', () => {
  it('attaches the live quotes settling at each account, grouped and named', async () => {
    state.accounts = [account(), account({ id: 'acct-2', label: 'Santander', is_default: false })];
    state.quotes = [
      { bank_account_id: 'acct-1', clients: { name: 'Constructora del Valle' } },
      { bank_account_id: 'acct-1', clients: { name: 'Constructora del Valle' } },
      { bank_account_id: 'acct-1', clients: { name: 'Ferretería Central' } },
    ];

    const res = await GET();
    const body = await res.json();

    const [first, second] = body.accounts;
    expect(first.live_quotes).toEqual({
      count: 3,
      client_names: ['Constructora del Valle', 'Ferretería Central'],
    });
    // No live quotes is a known zero — distinct from unknown below.
    expect(second.live_quotes).toEqual({ count: 0, client_names: [] });
  });

  it('answers unknown — null, never zero — when the quotes read fails', async () => {
    state.quotes = 'fail';

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accounts[0].live_quotes).toBeNull();
  });
});

describe('who may write a settlement account', () => {
  /**
   * `billing_management` — the same capability the PAC credentials need. A
   * manager can run most of this product; they may not redirect where the
   * business gets paid.
   */
  it.each(['manager', 'member', 'accountant'])('refuses a %s on create', async (role) => {
    currentRole = role;
    const res = await post({ label: 'X', bankName: 'BBVA', clabe: VALID_CLABE });

    expect(res.status).toBe(403);
    expect(state.inserts).toHaveLength(0);
  });

  it.each(['manager', 'member', 'accountant'])('refuses a %s on edit', async (role) => {
    currentRole = role;
    const res = await patch('acct-1', { label: 'X', bankName: 'BBVA', clabe: VALID_CLABE });

    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it.each(['manager', 'member', 'accountant'])('refuses a %s on archive', async (role) => {
    currentRole = role;
    const res = await del('acct-1');

    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it('refuses a manager who asks to switch the default', async () => {
    currentRole = 'manager';
    const res = await patch('acct-1', { makeDefault: true });

    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });
});

describe('creating', () => {
  it('flags the first account as the default', async () => {
    state.accounts = [];
    const res = await post({ label: 'BBVA obra', bankName: 'BBVA México', clabe: VALID_CLABE });

    expect(res.status).toBe(200);
    expect(state.inserts[0]).toMatchObject({ organization_id: 'org-1', is_default: true });
  });

  it('does not flag a second account as the default', async () => {
    const res = await post({ label: 'Santander', bankName: 'Santander', clabe: '014180001234567897' });

    expect(res.status).toBe(200);
    expect(state.inserts[0]).toMatchObject({ is_default: false });
  });

  /** Every problem at once, keyed by input (#146). */
  it('answers an invalid account with every field that is wrong', async () => {
    const res = await post({ label: '', bankName: '', clabe: '0121' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(Object.keys(body.error.fields).sort()).toEqual(['bankName', 'clabe', 'label']);
    expect(state.inserts).toHaveLength(0);
  });

  it('writes an audit row naming the account, never the CLABE', async () => {
    state.accounts = [];
    await post({ label: 'BBVA obra', bankName: 'BBVA México', clabe: VALID_CLABE });

    expect(state.audits[0]).toMatchObject({ action: 'settlement_account.added' });
    expect(JSON.stringify(state.audits[0])).not.toContain(VALID_CLABE);
  });
});

describe('archiving', () => {
  it('refuses to archive the default while other live accounts exist', async () => {
    state.accounts = [account(), account({ id: 'acct-2', is_default: false, label: 'Santander' })];
    const res = await del('acct-1');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('DEFAULT_ACCOUNT');
    // Nothing archived: leaving unassigned quotes resolving to nothing while
    // other accounts are live is a tenant who can be paid being told they cannot.
    expect(state.updates.filter((u) => u.values.archived_at)).toHaveLength(0);
  });

  it('archives the last account when the tenant knowingly has no other', async () => {
    const res = await del('acct-1');

    expect(res.status).toBe(200);
    expect(state.updates.some((u) => u.values.archived_at && u.values.is_default === false)).toBe(true);
  });

  it('scopes the write by organization as well as id', async () => {
    await del('acct-1');

    const archive = state.updates.find((u) => u.values.archived_at);
    expect(archive?.filters).toMatchObject({ id: 'acct-1', organization_id: 'org-1' });
  });
});

describe('switching the default', () => {
  beforeEach(() => {
    state.accounts = [account(), account({ id: 'acct-2', is_default: false, label: 'Santander' })];
  });

  it('clears the current default before setting the new one', async () => {
    const res = await patch('acct-2', { makeDefault: true });

    expect(res.status).toBe(200);
    // The partial unique index permits one live default, so the order matters:
    // setting first would be refused by the database.
    const clear = state.updates.findIndex((u) => u.values.is_default === false);
    const set = state.updates.findIndex((u) => u.values.is_default === true);
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(set).toBeGreaterThan(clear);
  });

  it('refuses to make an archived account the default', async () => {
    state.accounts = [account({ id: 'acct-2', archived_at: '2026-08-01T00:00:00Z', is_default: false })];
    const res = await patch('acct-2', { makeDefault: true });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ACCOUNT_ARCHIVED');
  });

  /**
   * The clear landed and the set did not, so the organization has live accounts
   * and **no default** — every quote naming no account refuses in front of its
   * client. The previous default must go back rather than being left cleared.
   */
  it('restores the previous default when the set fails', async () => {
    state.failSetDefault = true;
    const res = await patch('acct-2', { makeDefault: true });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const restore = state.updates.filter(
      (u) => u.values.is_default === true && u.filters.id === 'acct-1'
    );
    expect(restore.length).toBeGreaterThan(0);
  });

  it('audits the switch', async () => {
    await patch('acct-2', { makeDefault: true });

    expect(state.audits[0]).toMatchObject({ action: 'settlement_account.default_changed' });
  });
});

describe('a by-id route must not reveal another tenant’s row', () => {
  it('404s for an id this organization does not hold', async () => {
    state.accounts = [];
    const res = await patch('acct-of-another-org', { makeDefault: true });

    expect(res.status).toBe(404);
  });
});

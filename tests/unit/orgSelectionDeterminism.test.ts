import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #133 — `requireOrgAccess` chose the caller's tenant with `LIMIT 1` and no
 * `ORDER BY`.
 *
 * Postgres guarantees nothing about which row that returns, and the choice can
 * change between two calls as the physical layout shifts. Every authenticated
 * route scopes its queries by the id this function hands back, so a user who
 * owns two organizations would see another company's data with no error
 * anywhere. These tests drive the real function against a fake client that
 * records the query it built.
 */

const authUser = { id: 'user-1' };
const queries: Array<{
  table: string;
  order: Array<[string, { ascending: boolean }]>;
  limit: number | null;
}> = [];
let ownedRows: Array<Record<string, unknown>> = [];
let memberRows: Array<Record<string, unknown>> = [];

function builderFor(table: string) {
  const record = { table, order: [] as Array<[string, { ascending: boolean }]>, limit: null as number | null };
  queries.push(record);

  const rows = () => (table === 'organizations' ? ownedRows : memberRows);

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: (column: string, options: { ascending: boolean }) => {
      record.order.push([column, options]);
      return builder;
    },
    limit: (count: number) => {
      record.limit = count;
      // The database applies the limit; the fake must too, or a test asserting
      // "the oldest row wins" would pass on a builder that ignored ORDER BY.
      return Promise.resolve({ data: rows().slice(0, count), error: null });
    },
  };

  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authUser } }) },
    from: (table: string) => builderFor(table),
  }),
}));

const { requireOrgAccess } = await import('@/lib/apiAuth');

beforeEach(() => {
  queries.length = 0;
  ownedRows = [];
  memberRows = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireOrgAccess picks a tenant deterministically', () => {
  it('orders the owned-organizations lookup instead of taking an arbitrary row', async () => {
    ownedRows = [{ id: 'org-oldest' }, { id: 'org-newer' }];

    const result = await requireOrgAccess();

    expect(result.ok).toBe(true);
    const organizations = queries.find((q) => q.table === 'organizations');
    expect(organizations?.order).toEqual([['created_at', { ascending: true }]]);
  });

  it('orders the membership lookup too', async () => {
    memberRows = [
      { organization_id: 'org-oldest', role: 'manager' },
      { organization_id: 'org-newer', role: 'member' },
    ];

    await requireOrgAccess();

    const members = queries.find((q) => q.table === 'organization_members');
    expect(members?.order).toEqual([['created_at', { ascending: true }]]);
  });

  it('resolves to the same organization on repeated calls', async () => {
    ownedRows = [{ id: 'org-oldest' }, { id: 'org-newer' }];

    const first = await requireOrgAccess();
    const second = await requireOrgAccess();

    expect(first.ok && first.ctx.organizationId).toBe('org-oldest');
    expect(second.ok && second.ctx.organizationId).toBe('org-oldest');
  });

  it('fetches a second row so the ambiguity can be seen, and says so', async () => {
    ownedRows = [{ id: 'org-oldest' }, { id: 'org-newer' }];

    await requireOrgAccess();

    // `.limit(1)` cannot tell "one organization" from "the first of several".
    expect(queries.find((q) => q.table === 'organizations')?.limit).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('more than one organization'));
  });

  it('stays silent for the ordinary one-organization user', async () => {
    ownedRows = [{ id: 'org-only' }];

    const result = await requireOrgAccess();

    expect(result.ok && result.ctx.organizationId).toBe('org-only');
    expect(result.ok && result.ctx.role).toBe('owner');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('falls through to membership when the user owns nothing', async () => {
    memberRows = [{ organization_id: 'org-member', role: 'accountant' }];

    const result = await requireOrgAccess();

    expect(result.ok && result.ctx.organizationId).toBe('org-member');
    expect(result.ok && result.ctx.role).toBe('accountant');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still refuses a user with no organization at all', async () => {
    const result = await requireOrgAccess();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});

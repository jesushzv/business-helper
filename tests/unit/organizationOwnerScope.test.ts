import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * #109 / #168 — an owner may hold more than one organization, and the write
 * path assumed they could not.
 *
 * `organizations.owner_id` carries no unique index (confirmed against the live
 * catalog in #168, which also found the schema doc asserting one that was never
 * created). #109 decided that multi-org ownership stays *possible* — the schema
 * is not narrowed — and that the application is what stops assuming a single
 * owned row.
 *
 * Two failures follow from that assumption and both are pinned below:
 *
 *  1. `PATCH /api/organization` updated `.eq('owner_id', userId)` alone. Against
 *     two owned rows PostgREST's singular-response check fails, `.maybeSingle()`
 *     returns nothing, and the route answered 404 "No se encontró una
 *     organización propia" — an owner told their business does not exist, unable
 *     to save their CFDI identity or their SPEI settlement account.
 *  2. `requireOrgAccess()` took `.limit(1)` with no `ORDER BY`, so which
 *     organization a request resolved was whatever Postgres felt like returning.
 *     Two requests in one session could read one organization and write another.
 */

// ---------------------------------------------------------------------------
// Scanning gate: no write to `organizations` scoped by owner_id alone.
// ---------------------------------------------------------------------------

/**
 * Comments quote the defect they document — including the old
 * `.eq('owner_id', userId)` chain — so they are stripped before matching, as in
 * apiAuthHardening.test.ts.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Every `.from('organizations')` chain in a file, as the text running from the
 * call to the end of its statement.
 *
 * Chains are multi-line and interleaved with other queries, so the segment ends
 * at the next `.from(` or at a blank line following a `;` — whichever comes
 * first — rather than at a fixed character budget, which would read a long
 * chain's `.eq()` out of a *neighbouring* query and pass on it.
 */
function organizationChains(source: string): string[] {
  const chains: string[] = [];
  const marker = /\.from\(\s*['"]organizations['"]\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(source)) !== null) {
    const rest = source.slice(match.index + match[0].length);
    const nextFrom = rest.search(/\.from\(/);
    const statementEnd = rest.search(/;\s*\n/);
    const ends = [nextFrom, statementEnd].filter((i) => i >= 0);
    chains.push(ends.length ? rest.slice(0, Math.min(...ends)) : rest);
  }

  return chains;
}

const WRITE_CALL = /\.(update|delete|upsert)\(/;

describe('writes to `organizations` name the row, not just its owner (#109)', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')];

  it('finds the organization query sites it is meant to be scanning', () => {
    // An assertion of absence that matches nothing is indistinguishable from
    // one that passes, so the scan proves it parsed a plausible number of
    // chains before claiming they are all clean.
    const chains = files.flatMap((f) => organizationChains(stripComments(readFileSync(f, 'utf8'))));
    expect(chains.length).toBeGreaterThanOrEqual(5);
    expect(chains.filter((c) => WRITE_CALL.test(c)).length).toBeGreaterThanOrEqual(1);
  });

  it('never scopes a write by owner_id alone', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const chain of organizationChains(source)) {
        if (!WRITE_CALL.test(chain)) continue;
        const byOwner = /\.eq\(\s*['"]owner_id['"]/.test(chain);
        const byId = /\.eq\(\s*['"]id['"]/.test(chain);
        if (byOwner && !byId) offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// requireOrgAccess resolves deterministically.
// ---------------------------------------------------------------------------

interface QueryRecord {
  table: string;
  orders: string[];
}

const queries: QueryRecord[] = [];
let ownedOrgs: Array<{ id: string }> = [];
let memberships: Array<{ organization_id: string; role: string }> = [];

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const record: QueryRecord = { table, orders: [] };
      queries.push(record);
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: (column: string) => {
          record.orders.push(column);
          return builder;
        },
        limit: async () => ({
          data: table === 'organizations' ? ownedOrgs : memberships,
        }),
      };
      return builder;
    },
  }),
}));

import { requireOrgAccess } from '@/lib/apiAuth';

beforeEach(() => {
  queries.length = 0;
  ownedOrgs = [];
  memberships = [];
});

describe('requireOrgAccess picks an organization deterministically (#109)', () => {
  it('orders the owned-organization lookup by a total key before taking one', async () => {
    ownedOrgs = [{ id: 'org-a' }];
    const result = await requireOrgAccess();

    expect(result.ok).toBe(true);
    const orgQuery = queries.find((q) => q.table === 'organizations');
    // created_at alone is not a total order — two rows can share it — so `id`
    // has to break the tie, or the "deterministic" choice still is not.
    expect(orgQuery?.orders).toEqual(['created_at', 'id']);
  });

  it('orders the membership lookup too, for a user who owns nothing', async () => {
    memberships = [{ organization_id: 'org-b', role: 'admin' }];
    const result = await requireOrgAccess();

    expect(result.ok).toBe(true);
    const memberQuery = queries.find((q) => q.table === 'organization_members');
    expect(memberQuery?.orders).toEqual(['invited_at', 'id']);
  });
});

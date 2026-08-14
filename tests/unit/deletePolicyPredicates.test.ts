import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The database's DELETE policies and the routes' guards say the same thing (#336).
 *
 * #327 made record deletion capability-gated and guarded, but every one of
 * those protections lives in the route handler. An authenticated org member
 * can take their session JWT straight to PostgREST, where no route runs — and
 * the tenant policies are `FOR ALL`, which covers DELETE. So a converted quote
 * (the OTP legal evidence) was deletable by anyone in the organization,
 * `delete_records` capability or not.
 *
 * The restrictive policies added in 20260814210100 close that. They are
 * *proven* against real Postgres in `supabase/ci/assertions.sql` §9, by
 * impersonating a real `auth.uid()` and reading the affected row count back —
 * RLS refuses silently, so an exception is not what a refusal looks like.
 *
 * What this file protects is the pair staying in agreement. Two enforcement
 * layers deciding "may this row be deleted" will drift, and when they do the
 * app layer is the one that gets edited — leaving the database refusing a
 * delete the product now intends to allow, with no error a tenant can read
 * (#146's shape, one layer down).
 */

const root = process.cwd();
const policyMigration = readFileSync(
  join(root, 'supabase/migrations/20260814210100_deletion_invariants_delete_policies.sql'),
  'utf8'
);

/** The USING (…) predicate of a named policy in the migration. */
function predicateOf(policyName: string): string {
  const start = policyMigration.indexOf(`CREATE POLICY "${policyName}"`);
  expect(start, `policy "${policyName}" is not in the migration`).toBeGreaterThan(-1);
  const using = policyMigration.indexOf('USING (', start);
  const end = policyMigration.indexOf(');', using);
  return policyMigration.slice(using + 'USING ('.length, end);
}

describe('the DELETE policies mirror the route guards (#336)', () => {
  it('quotes: the policy lists exactly the statuses the route allows', () => {
    const route = readFileSync(join(root, 'app/api/quotes/[id]/route.ts'), 'utf8');
    const declared = /DELETABLE_QUOTE_STATUSES\s*=\s*\[([^\]]+)\]/.exec(route);
    expect(declared, 'DELETABLE_QUOTE_STATUSES is no longer a literal array in the route').not.toBeNull();

    const routeStatuses = [...(declared as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .sort();
    const policyStatuses = [...predicateOf('Deletable quote statuses only').matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .sort();

    // Derived from both files, and the parse is checked for plausibility —
    // two empty arrays compare equal and would pass silently.
    expect(routeStatuses.length).toBeGreaterThan(2);
    expect(policyStatuses).toEqual(routeStatuses);
    // The states this exists to protect are in neither list.
    expect(policyStatuses).not.toContain('converted');
    expect(policyStatuses).not.toContain('accepted');
  });

  it('milestones: the policy matches the preconditions inside the route DELETE', () => {
    const route = readFileSync(join(root, 'app/api/receivables/[id]/route.ts'), 'utf8');
    // The guards ride inside the DELETE's own filter chain so a payment landing
    // mid-request still blocks it; the policy has to say the same pair.
    expect(route).toContain(".eq('status', 'pending')");
    expect(route).toContain(".eq('cfdi_status', 'none')");

    const predicate = predicateOf('Deletable milestone states only');
    expect(predicate).toMatch(/status\s*=\s*'pending'/);
    expect(predicate).toMatch(/cfdi_status\s*=\s*'none'/);
    // AND, not OR: either alone lets a stamped cobro or a paid one through.
    expect(predicate).toMatch(/\bAND\b/);
    expect(predicate).not.toMatch(/\bOR\b/);
  });

  it('both policies are RESTRICTIVE and scoped to DELETE', () => {
    // A PERMISSIVE policy would be a no-op that reads as protection: permissive
    // policies combine with OR, so it would grant rather than constrain. The
    // live catalog is checked in assertions.sql; this catches it in the diff.
    for (const name of ['Deletable quote statuses only', 'Deletable milestone states only']) {
      const start = policyMigration.indexOf(`CREATE POLICY "${name}"`);
      const header = policyMigration.slice(start, policyMigration.indexOf('USING (', start));
      expect(header, `${name} must be AS RESTRICTIVE`).toContain('AS RESTRICTIVE');
      expect(header, `${name} must be FOR DELETE`).toContain('FOR DELETE');
    }
  });

  it('the FK migration makes both references RESTRICT, not CASCADE or SET NULL', () => {
    const fk = readFileSync(
      join(root, 'supabase/migrations/20260814210000_deletion_invariants_fk_restrict.sql'),
      'utf8'
    );
    const constraints = [...fk.matchAll(/ADD CONSTRAINT (\w+)[\s\S]*?ON DELETE (\w+)/g)].map((m) => [
      m[1],
      m[2],
    ]);

    expect(constraints).toEqual([
      ['contracts_quote_id_fkey', 'RESTRICT'],
      ['cfdi_stamp_claims_milestone_id_fkey', 'RESTRICT'],
    ]);
  });

  it('the quotes route names the RESTRICT refusal in Spanish rather than letting it read as a 500', () => {
    const route = readFileSync(join(root, 'app/api/quotes/[id]/route.ts'), 'utf8');
    // Without a restrictMessage the 23503 lands on the generic "tiene
    // registros relacionados", which tells the tenant nothing they can act on.
    expect(route).toContain('restrictMessage:');
    expect(route).toMatch(/restrictMessage:[\s\S]{0,200}contrato/);
  });

  it('both issued-writes in the invoice route read the affected row count back', () => {
    const route = readFileSync(join(root, 'app/api/invoices/issue/route.ts'), 'utf8');
    // #336's complement: 0 rows changed looks exactly like success (#128), and
    // here that means a live SAT document reported as filed against a
    // milestone that is no longer there.
    expect(route).toContain('adopted.length === 0');
    expect(route).toContain('recorded.length === 0');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #146's root cause — an organization's owner was denied every write to it.
 *
 * `user_organization_ids()` is the entire tenant check for nine RLS policies,
 * and it resolved membership from `organization_members` alone. Nothing creates
 * a member row for the person who owns the organization, so for an owner it
 * returned the empty set and all nine policies denied everything.
 *
 * What hid it: the application layer disagreed. `requireOrgAccess()` resolves
 * the organization from `organizations.owner_id` first and returns
 * `role: 'owner'`, so auth passed, the route ran, and only the INSERT was
 * refused — as `42501`, which the route then reported as a generic 500. Two
 * layers with two different answers to "which organizations may this user act
 * on", and the disagreement only visible at the moment of a write.
 *
 * These read the migration files, so they pin the definition the repo ships.
 * They cannot prove what is live: the same claim against production needs the
 * catalog (`pg_get_functiondef`) and, to be worth anything, an impersonated
 * INSERT that is *refused* for another tenant. Both were run when this landed;
 * the transcript is in the PR.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Every migration in ledger order, so "last definition wins" is meaningful. */
function migrationsInOrder(): Array<{ name: string; sql: string }> {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }));
}

/** The definition that survives after every migration has been applied. */
function effectiveDefinition(): { name: string; body: string } {
  const defining = migrationsInOrder().filter((m) =>
    /CREATE OR REPLACE FUNCTION public\.user_organization_ids/i.test(m.sql)
  );
  expect(
    defining.length,
    'No migration defines user_organization_ids — the scan is broken, not the schema'
  ).toBeGreaterThanOrEqual(2);

  const last = defining[defining.length - 1];
  const match = /CREATE OR REPLACE FUNCTION public\.user_organization_ids[\s\S]*?\$function\$([\s\S]*?)\$function\$/i.exec(
    last.sql
  );
  expect(match, `Could not parse the function body out of ${last.name}`).toBeTruthy();
  return { name: last.name, body: match![1] };
}

describe('an organization owner can act on their own tenant (#146)', () => {
  it('the effective definition resolves ownership, not only membership', () => {
    const { body } = effectiveDefinition();

    expect(body).toMatch(/organization_members/);
    // The half that was missing. Without it an owner with no member row — which
    // is every owner, since nothing creates one — is denied all nine tables.
    expect(body).toMatch(/owner_id\s*=\s*auth\.uid\(\)/);
    expect(body).toMatch(/\bUNION\b/i);
  });

  it('deduplicates, so an owner who is also a member yields one id', () => {
    const { body } = effectiveDefinition();
    expect(body).not.toMatch(/UNION\s+ALL/i);
  });

  it('is still scoped by auth.uid() on both branches — no tenant boundary is crossed', () => {
    // The rule this change must not break (hard rule 4). A branch without
    // auth.uid() would hand every caller every organization.
    const { body } = effectiveDefinition();
    const branches = body
      .split(/\bUNION\b/i)
      .map((b) => b.trim())
      .filter(Boolean);

    expect(branches.length).toBe(2);
    for (const branch of branches) {
      expect(branch, `branch is unscoped: ${branch}`).toMatch(/auth\.uid\(\)/);
    }
  });

  it('pins a search_path, so the definer function cannot be captured', () => {
    const { name } = effectiveDefinition();
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    expect(sql).toMatch(/SET search_path\s*=/i);
  });

  it('does not revoke EXECUTE, which would deny every tenant read', () => {
    // The #76 posture is right for every other SECURITY DEFINER function here
    // and wrong for this one: the policies calling it are evaluated as the
    // querying role. securityDefinerGrants.test.ts holds the exemption; this
    // asserts the migration does not quietly contradict it.
    const { name } = effectiveDefinition();
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    const revokes = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .filter((line) => /REVOKE[\s\S]*user_organization_ids/i.test(line));
    expect(revokes).toEqual([]);
  });

  it('adds a new migration rather than editing the applied one', () => {
    // 20260803000000 is live in production; editing it would leave the repo and
    // the database silently disagreeing, since db:migrate skips ledgered files.
    const initial = readFileSync(join(MIGRATIONS, '20260803000000_initial_schema.sql'), 'utf8');
    expect(initial).not.toMatch(/owner_id\s*=\s*auth\.uid\(\)[\s\S]*?\$function\$/);
    expect(effectiveDefinition().name).not.toBe('20260803000000_initial_schema.sql');
  });
});

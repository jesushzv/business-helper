import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * #76 generalized — every `SECURITY DEFINER` function in `public` must revoke
 * EXECUTE from `anon` and `authenticated` **by name**.
 *
 * The defect this closes: `REVOKE ALL ON FUNCTION … FROM PUBLIC` reads like it
 * locks a function down and does not. Supabase grants EXECUTE on functions
 * created in `public` to `anon` and `authenticated` as *named roles*, and a
 * revoke of the implicit `PUBLIC` grant leaves a role-specific grant standing.
 * PostgREST then exposes the function at `/rest/v1/rpc/<name>`, and a
 * `SECURITY DEFINER` body runs outside RLS. That is how `reserve_cfdi_folio`
 * and `release_cfdi_folio` shipped callable by any signed-in user, who could
 * mint unlimited CFDI folios billed to the platform's PAC account (#76).
 *
 * #76 asked for two things beyond the fix: a check that flags the next
 * occurrence in review, and a sweep for existing ones. This test is both — it
 * is the check, and running it *is* the sweep.
 *
 * **What this test does not do.** It reads migration files. Grants live in the
 * database, and the migration ledger shows some were applied by hand
 * (docs/STATUS.md, 2026-08-08). A string match on SQL is not a check on
 * production — that is the exact failure `cfdiIssuance.test.ts:88` made, which
 * asserted the presence of a `GRANT … TO service_role` line while being blind
 * to who *else* held the grant. This test catches a migration authored without
 * the revoke; confirming the live grants still requires the query in #76:
 *
 *   SELECT p.proname, pg_get_userbyid(x.grantee) AS role
 *     FROM pg_proc p, aclexplode(p.proacl) x
 *    WHERE p.pronamespace = 'public'::regnamespace
 *      AND p.prosecdef AND x.privilege_type = 'EXECUTE'
 *      AND pg_get_userbyid(x.grantee) IN ('anon', 'authenticated');
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

/**
 * Functions that legitimately keep their `authenticated` EXECUTE grant.
 *
 * This is an allow-list, not a TODO list: adding to it is a security decision
 * and needs the reason written down here.
 */
const EXEMPT: Record<string, string> = {
  /**
   * REQUIRED — do not revoke. `user_organization_ids()` is called from inside
   * 12 RLS policies (`id IN (SELECT public.user_organization_ids())`). Policy
   * expressions are evaluated as the *querying* role, so revoking EXECUTE from
   * `authenticated` would make every policy raise `permission denied for
   * function` — i.e. it would break every authenticated read in the product,
   * not harden it.
   *
   * It is also the safe shape: no parameters, and the body filters on
   * `auth.uid()`, so a caller hitting /rest/v1/rpc/user_organization_ids can
   * only ever learn the organization ids it already belongs to. The danger
   * #76 describes needs a function that takes a tenant id as an argument —
   * which is exactly what the two folio RPCs did.
   */
  user_organization_ids:
    'Called by RLS policies as the querying role; revoking breaks every policy. Parameterless and scoped to auth.uid().',
};

interface DefinerFunction {
  name: string;
  file: string;
}

function findSecurityDefinerFunctions(): DefinerFunction[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const found: DefinerFunction[] = [];

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)/gi;

    const starts: Array<{ name: string; index: number }> = [];
    for (const m of sql.matchAll(createRe)) {
      starts.push({ name: m[1], index: m.index ?? 0 });
    }

    starts.forEach((start, i) => {
      // The declaration runs to the next CREATE FUNCTION in the same file, or
      // to the end of it — SECURITY DEFINER may sit in the header or after the
      // body's closing $$, so the whole span has to be considered.
      const end = i + 1 < starts.length ? starts[i + 1].index : sql.length;
      const body = sql.slice(start.index, end);
      if (/SECURITY\s+DEFINER/i.test(body)) {
        found.push({ name: start.name, file });
      }
    });
  }

  return found;
}

function combinedSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

/** True when some migration revokes EXECUTE on this function from both roles. */
function hasPerRoleRevoke(sql: string, fnName: string): boolean {
  const revokeRe = new RegExp(
    `REVOKE[^;]*?\\bON\\s+FUNCTION\\s+public\\.${fnName}\\s*\\([^)]*\\)[^;]*?FROM([^;]*);`,
    'gi'
  );
  for (const match of sql.matchAll(revokeRe)) {
    const roles = match[1].toLowerCase();
    if (roles.includes('anon') && roles.includes('authenticated')) return true;
  }
  return false;
}

describe('SECURITY DEFINER functions revoke EXECUTE from anon and authenticated (#76)', () => {
  const definers = findSecurityDefinerFunctions();
  const sql = combinedSql();

  it('finds the SECURITY DEFINER functions at all', () => {
    // A scan that matches nothing passes vacuously. These three exist today;
    // if the count drops, the parser broke rather than the debt clearing.
    const names = definers.map((d) => d.name).sort();
    expect(names).toEqual(['release_cfdi_folio', 'reserve_cfdi_folio', 'user_organization_ids']);
  });

  it.each(findSecurityDefinerFunctions().filter((d) => !(d.name in EXEMPT)))(
    'public.$name ($file) revokes EXECUTE from anon and authenticated by name',
    ({ name }) => {
      expect(
        hasPerRoleRevoke(sql, name),
        `public.${name} is SECURITY DEFINER but no migration revokes EXECUTE from anon, authenticated. ` +
          'REVOKE … FROM PUBLIC does not cover Supabase\'s per-role grants (#76). Add ' +
          `REVOKE EXECUTE ON FUNCTION public.${name}(<signature>) FROM anon, authenticated; ` +
          'or add it to EXEMPT in this file with the reason.'
      ).toBe(true);
    }
  );

  it('keeps the exemption list to functions whose grant is deliberate', () => {
    // Exempting a function is a security decision. This pins the current set so
    // a future addition has to be made here, in front of the reason.
    expect(Object.keys(EXEMPT)).toEqual(['user_organization_ids']);
    for (const reason of Object.values(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  it('every exempt function actually exists and is still SECURITY DEFINER', () => {
    // An exemption for a function that was renamed or dropped is dead weight
    // that would silently cover a *new* function of the same name.
    const names = definers.map((d) => d.name);
    for (const exempt of Object.keys(EXEMPT)) {
      expect(names).toContain(exempt);
    }
  });

  it('the RLS policies that force the user_organization_ids exemption still exist', () => {
    // The exemption's justification is that policies call it. If that stops
    // being true, the exemption should go and the function should be locked
    // down like the others.
    const callSites = (sql.match(/public\.user_organization_ids\(\)/g) || []).length;
    expect(callSites).toBeGreaterThan(1);
  });
});

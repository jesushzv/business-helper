import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #146 — a failed write must say what went wrong, to the tenant and to the log.
 *
 * `POST /api/clients` answered every database failure with one hardcoded 500,
 * "No se pudo crear el cliente", and discarded the error object. A column
 * missing from the schema cache (`PGRST204` — #96's exact shape), a CHECK
 * violation, a permission denial and a genuine outage were therefore
 * indistinguishable **on screen and in the logs**. The founder could not
 * register a client, could not learn why, and could not tell anyone what to
 * look at. That opacity was the defect; the underlying cause was secondary.
 *
 * The shape is mechanical, so it is scannable: a route that performs a write
 * and branches on `error` must consult that error — through
 * `describeDbWriteError`, or by reading `error.code` / `error.message` itself.
 *
 * **This gate does not claim the tree is clean.** Eleven routes carried the
 * same shape when it was written and are allowlisted below by name, tracked in
 * #148. What it does is stop the twelfth, and make removing an entry from the
 * list the way that debt is paid down. An allowlist that shrinks is a plan; a
 * grep nobody runs is not.
 */

const API_ROOT = join(process.cwd(), 'app', 'api');

/**
 * Routes that predate the gate. Each is a real instance of the defect, not an
 * exemption — the entry says "not fixed yet", never "fine as it is". Delete an
 * entry in the PR that fixes its route; nothing else may be added without one.
 */
const PRE_EXISTING = new Set([
  'app/api/organization/members/route.ts',
  'app/api/organization/route.ts',
  'app/api/products/[id]/route.ts',
  'app/api/products/route.ts',
  'app/api/quotes/[id]/route.ts',
  'app/api/quotes/public/[token]/route.ts',
  'app/api/quotes/route.ts',
  'app/api/receivables/[id]/confirm/route.ts',
  'app/api/receivables/[id]/route.ts',
  'app/api/receivables/public/[token]/route.ts',
  'app/api/receivables/route.ts',
]);

const WRITES = /\.(insert|update|upsert|delete)\(/;
const BRANCHES_ON_ERROR = /if \(\s*error/;
/** Consulting the error: the shared describer, or reading it directly. */
const CONSULTS_ERROR = /describeDbWriteError|error\.(code|message)|error\?\.(code|message)/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

/** Every route that writes and branches on the result — the population at risk. */
function writeRoutes(): Array<{ rel: string; source: string }> {
  return routeFiles(API_ROOT)
    .map((file) => ({
      rel: file.replace(process.cwd() + '/', ''),
      source: readFileSync(file, 'utf8'),
    }))
    .filter(({ source }) => WRITES.test(source) && BRANCHES_ON_ERROR.test(source));
}

describe('a failed write names its cause (#146)', () => {
  it('finds a plausible population of write routes (guards the guard)', () => {
    // A scan that silently matched nothing would pass every assertion below
    // while checking exactly nothing — the failure mode CLAUDE.md rule 7 names.
    const routes = writeRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(12);
    expect(routes.map((r) => r.rel)).toContain('app/api/clients/route.ts');
  });

  it('no new route discards the error object', () => {
    const offenders = writeRoutes()
      .filter(({ rel }) => !PRE_EXISTING.has(rel))
      .filter(({ source }) => !CONSULTS_ERROR.test(source))
      .map(({ rel }) => rel);

    expect(
      offenders,
      `These routes write to the database and branch on \`error\`, but never read it — ` +
        `so every cause collapses into one hardcoded message and nothing is logged.\n\n` +
        `${offenders.map((o) => `  - ${o}`).join('\n')}\n\n` +
        `Pass the error through \`describeDbWriteError\` (lib/dbWriteError.ts): it returns a ` +
        `Spanish message naming the cause, the column to blame where there is one, a status, ` +
        `and it logs the original through captureException. See app/api/clients/route.ts.`
    ).toEqual([]);
  });

  it('the allowlist is live debt, not decoration', () => {
    // An entry for a route that no longer exists, or that has since been fixed,
    // makes the list lie about how much is left. Both directions are errors.
    for (const rel of PRE_EXISTING) {
      const route = writeRoutes().find((r) => r.rel === rel);
      expect(route, `${rel} is allowlisted but is no longer a write route — remove the entry`)
        .toBeTruthy();
      expect(
        CONSULTS_ERROR.test(route!.source),
        `${rel} now reads its error — delete its allowlist entry (that is how #148 closes)`
      ).toBe(false);
    }
  });

  it('the route the defect was reported on is not on the list', () => {
    expect(PRE_EXISTING.has('app/api/clients/route.ts')).toBe(false);
    expect(PRE_EXISTING.has('app/api/clients/[id]/route.ts')).toBe(false);
  });
});

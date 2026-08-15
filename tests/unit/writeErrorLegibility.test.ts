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
 * Eleven routes carried the same shape when this gate was written and were
 * allowlisted by name under #148. The list is now **empty**: every one of them
 * routes its failure through `dbWriteErrorResponse` (or, on the two public
 * routes, `publicDbWriteErrorResponse`). The gate therefore covers the whole
 * tree — an allowlist that shrank to nothing is what closing that issue means,
 * and re-adding an entry now needs the same argument as writing the defect.
 */

const API_ROOT = join(process.cwd(), 'app', 'api');

/**
 * Routes that predate the gate. Each is a real instance of the defect, not an
 * exemption — the entry says "not fixed yet", never "fine as it is". Delete an
 * entry in the PR that fixes its route; nothing else may be added without one.
 */
const PRE_EXISTING = new Set<string>([]);

/**
 * A write, in either shape the tree uses.
 *
 * The PostgREST verbs, **and `.rpc(`** — the public payment route moved its
 * declaration into `record_milestone_payment` so the claim, the ledger row and
 * the new total land in one transaction (#381), and a route that writes through
 * a function must not escape this gate by doing so. It dropped out of the
 * population entirely when the verbs were the only signal, which is the failure
 * mode rule 7 names: a scan that stops matching looks exactly like a scan that
 * found nothing wrong.
 */
const WRITES = /\.(insert|update|upsert|delete|rpc)\(/;
/**
 * `if (error`, and every renamed sibling: the public routes call theirs
 * `updateError`, the confirm route `auditError`. Matching only the bare name
 * let the two public routes — both on #148's list — pass the branch scan with
 * no branch found at all.
 */
const BRANCHES_ON_ERROR = /if \(\s*\w*[eE]rror\b/;
/**
 * Consulting the error: either shared helper (which classify it, log the
 * original and build the envelope), the describer directly, reading the error's
 * own fields, or handing the whole object to a logger.
 *
 * The variable is rarely called `error` — `updateError`, `claimError`,
 * `consumeError`, `auditError` are all in the tree — and the name it is
 * branched on must be the name that is read, or the scan grades a route on
 * some *other* error it happened to consult nearby.
 */
const CONSULTS_ERROR =
  /describeDbWriteError|dbWriteErrorResponse|publicDbWriteErrorResponse|\w*[eE]rror\??\.(code|message)|(?:console\.(?:error|warn)|captureException)\([^)]*[eE]rror\b/;

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

/**
 * The individual `if (error …)` branches that follow a **write**, each with the
 * text that handles it.
 *
 * Per-file was too coarse: a file with two write branches passed as soon as one
 * of them consulted its error, so half a fix — and half a revert — looked
 * identical to a whole one. The chain a branch belongs to starts at its
 * nearest preceding `.from(`, so whether that chain wrote is decidable; a
 * branch on a failed *read* is a different defect and not this gate's business.
 */
/**
 * The `{ … }` a branch owns, by brace matching.
 *
 * A fixed-size window was the obvious first cut and it lied both ways: it ran
 * past a short branch into the next one's handling, and it stopped short of a
 * long branch's `captureException` — reporting a route that logs its error as
 * one that discards it.
 */
function branchBody(source: string, from: number): string {
  const open = source.indexOf('{', from);
  if (open === -1) return source.slice(from, from + 200);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  return source.slice(from);
}

function writeBranches(source: string): Array<{ line: number; handler: string }> {
  const branches: Array<{ line: number; handler: string }> = [];
  const pattern = new RegExp(BRANCHES_ON_ERROR.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const before = source.slice(0, match.index);
    // A write chain starts at `.from(` for the table verbs and at `.rpc(` for a
    // function call — take whichever is nearer, so an `.rpc(` after the last
    // `.from(` is still seen as its own chain.
    const chainStart = Math.max(before.lastIndexOf('.from('), before.lastIndexOf('.rpc('));
    if (chainStart === -1) continue;
    if (!WRITES.test(before.slice(chainStart))) continue;

    branches.push({
      line: before.split('\n').length,
      handler: branchBody(source, match.index),
    });
  }

  return branches;
}

describe('a failed write names its cause (#146)', () => {
  it('finds a plausible population of write routes (guards the guard)', () => {
    // A scan that silently matched nothing would pass every assertion below
    // while checking exactly nothing — the failure mode CLAUDE.md rule 7 names.
    const routes = writeRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(12);
    expect(routes.map((r) => r.rel)).toContain('app/api/clients/route.ts');
  });

  it('finds a plausible population of write branches (guards the guard)', () => {
    // Same reasoning one level down: a branch scan that matched nothing would
    // make the assertion below vacuous.
    const branches = writeRoutes().flatMap(({ rel, source }) =>
      writeBranches(source).map((b) => `${rel}:${b.line}`)
    );
    expect(branches.length).toBeGreaterThanOrEqual(15);
  });

  it('no write branch discards the error object', () => {
    const offenders = writeRoutes()
      .filter(({ rel }) => !PRE_EXISTING.has(rel))
      .flatMap(({ rel, source }) =>
        writeBranches(source)
          .filter(({ handler }) => !CONSULTS_ERROR.test(handler))
          .map(({ line }) => `${rel}:${line}`)
      );

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

  it('the eleven routes #148 tracked each consult their error (pins the closure)', () => {
    // The allowlist being empty proves nothing on its own — deleting the names
    // and the routes both empty it. These are the eleven, by name, asserted
    // from the other side: a revert of any one of them fails here as well.
    const FIXED_IN_148 = [
      'app/api/organization/members/route.ts',
      'app/api/organization/route.ts',
      'app/api/products/[id]/route.ts',
      'app/api/products/route.ts',
      'app/api/quotes/[id]/route.ts',
      'app/api/quotes/public/[token]/route.ts',
      'app/api/quotes/route.ts',
      'app/api/receivables/[id]/confirm/route.ts',
      'app/api/receivables/[id]/route.ts',
      'app/api/receivables/route.ts',
    ];

    // `app/api/receivables/public/[token]/route.ts` was the eleventh and is
    // deliberately not in that list any more: its declaration write moved into
    // `record_milestone_payment` behind `lib/milestonePayments.ts` (#381), so
    // it holds no `.from(…).update(…)` chain for the scan above to find. The
    // obligation did not move with it — the assertion below is what carries it,
    // and dropping the name without replacing the check is how a pin quietly
    // becomes a gap.
    const routes = writeRoutes();
    for (const rel of FIXED_IN_148) {
      const route = routes.find((r) => r.rel === rel);
      expect(route, `${rel} no longer exists as a write route — update this list and say so`)
        .toBeTruthy();
      const branches = writeBranches(route!.source);
      expect(branches.length, `${rel} has no write branch left to check`).toBeGreaterThan(0);
      for (const { line, handler } of branches) {
        expect(
          CONSULTS_ERROR.test(handler),
          `${rel}:${line} stopped consulting its failed write — that is #148 coming back`
        ).toBe(true);
      }
    }
  });

  it('a route whose write moved behind a helper still hands over the cause', () => {
    // The public payment route (#381). Its write is one RPC inside
    // `lib/milestonePayments.ts`, which returns the original PostgREST error as
    // `dbError` precisely so this route can classify it: `42P01` — a deployment
    // running ahead of its hand-applied migration (hard rule #6) — must reach
    // the payer as "vuelve a intentar en unos minutos" (503), not as the same
    // flat 500 an outage gets.
    const route = readFileSync(
      join(API_ROOT, 'receivables', 'public', '[token]', 'route.ts'),
      'utf8'
    );
    expect(route).toMatch(/ledgerError\b/);
    expect(
      /publicDbWriteErrorResponse\(\s*ledgerError\.dbError/.test(route),
      'the failed declaration must pass its original error to publicDbWriteErrorResponse'
    ).toBe(true);

    const helper = readFileSync(join(process.cwd(), 'lib', 'milestonePayments.ts'), 'utf8');
    expect(
      /dbError:\s*error/.test(helper),
      'lib/milestonePayments.ts must return the original error, not just a code'
    ).toBe(true);
  });

  it('the route the defect was reported on is not on the list', () => {
    expect(PRE_EXISTING.has('app/api/clients/route.ts')).toBe(false);
    expect(PRE_EXISTING.has('app/api/clients/[id]/route.ts')).toBe(false);
  });
});

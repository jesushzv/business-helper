#!/usr/bin/env node
/**
 * Fails when a migration in supabase/migrations/ is not applied to the target
 * database.
 *
 * Twice in one week a migration merged, Vercel deployed the code that needed
 * it, and the schema followed hours or days later:
 *
 *   * `record_owner_payment` (#394) — every owner confirmation and every
 *     "Registrar pago" failed `42P01` for a day. It failed honestly, but the
 *     confirm step of the cash-flow loop was down.
 *   * `20260816150000` (#382/#371) — a client returning to pay a remainder got
 *     a 409 instead.
 *
 * Both were found by an audit that happened to run, not by anything that
 * watches. `.github/workflows/ci.yml`'s "Migration ordering reminder" warns
 * that a PR carries a migration; it cannot say whether the migration is
 * *applied*, because that is a fact about the database rather than the diff.
 * This is that check.
 *
 *   npm run verify:migrations
 *
 * Requires SUPABASE_DB_URL, the same variable `db:migrate` takes.
 *
 * ## The ledger caveat, and why this still works
 *
 * `docs/LESSONS.md` warns that the ledger does not list hand-applied work — so
 * a migration applied through a connector or `psql` can be live while
 * `supabase_migrations.schema_migrations` has no row for it, and this script
 * will call it unapplied.
 *
 * That is a false positive worth having, and the fix is not to weaken the
 * check: it is to **stamp the ledger when you apply by hand**, which makes the
 * ledger mean what it claims to mean. (This is not hypothetical — applying
 * `record_owner_payment` through the Supabase connector stamped a row under the
 * connector's own version rather than the file's, and it had to be corrected to
 * `20260815200000` so `supabase db push` would skip it.)
 *
 * A green run here therefore asserts something narrower than "the schema is
 * right": every migration file has a ledger row on the target. Proving a
 * migration's *effect* is a different job — read the object back from the live
 * catalog, and prove a constraint by making it reject something.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!existsSync(MIGRATIONS_DIR)) {
  fail(`No migrations directory at ${MIGRATIONS_DIR}`);
}

/** `20260817200000_quotes_tax_treatment.sql` → `20260817200000`. */
function versionOf(filename) {
  const match = /^(\d{14})_/.exec(filename);
  return match ? match[1] : null;
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  fail('No migration files found — the scan matched nothing, which is not the same as everything being applied.');
}

const unversioned = files.filter((f) => !versionOf(f));
if (unversioned.length > 0) {
  fail(
    `These migration files have no 14-digit version prefix, so they cannot be matched\n` +
      `  against the ledger and this check cannot speak for them:\n` +
      unversioned.map((f) => `    • ${f}`).join('\n')
  );
}

const dbUrl = process.env.SUPABASE_DB_URL;

// Exits non-zero rather than skipping quietly: a verification script that
// cannot run has not verified anything, and saying so is the whole point
// (docs/LESSONS.md — an incomplete run exits non-zero naming what it skipped).
if (!dbUrl) {
  fail(
    'SUPABASE_DB_URL is not set, so nothing was checked.\n\n' +
      '  This is a failure, not a skip: the check exists because two migrations\n' +
      '  reached production behind their code, and a silent pass here would be\n' +
      '  indistinguishable from a clean run.\n\n' +
      '  export SUPABASE_DB_URL="postgres://postgres:<password>@<host>:5432/postgres"'
  );
}

const redactedHost = (() => {
  try {
    return new URL(dbUrl).host;
  } catch {
    return '<unparseable host>';
  }
})();

console.log(`\nMigration files: ${files.length}`);
console.log(`Target: ${redactedHost}\n`);

const result = spawnSync(
  'npx',
  ['--yes', 'supabase', 'migration', 'list', '--db-url', dbUrl, '--output-format', 'json'],
  { encoding: 'utf8' }
);

if (result.error) {
  fail(`Could not run the Supabase CLI: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(
    `supabase migration list exited with code ${result.status}.\n` +
      `  Nothing was verified.\n\n${(result.stderr || '').trim()}`
  );
}

let rows;
try {
  rows = JSON.parse(result.stdout);
} catch {
  fail(
    'Could not parse the CLI output as JSON, so nothing was verified.\n\n' +
      `${(result.stdout || '').trim().slice(0, 800)}`
  );
}

if (!Array.isArray(rows)) {
  fail('The CLI returned JSON that is not a list of migrations; nothing was verified.');
}

// The CLI reports both sides per row; a row with no remote version is a
// migration this database has never had applied.
const remoteVersions = new Set(
  rows.map((row) => row?.remote ?? row?.remote_version ?? null).filter(Boolean).map(String)
);

const unapplied = files.filter((f) => !remoteVersions.has(versionOf(f)));

if (unapplied.length > 0) {
  fail(
    `${unapplied.length} migration(s) in the repo are not applied on ${redactedHost}:\n` +
      unapplied.map((f) => `    • ${f}`).join('\n') +
      '\n\n' +
      '  Apply them before merging the code that needs them (hard rule #6):\n' +
      '    npm run db:migrate:dry   # review\n' +
      '    npm run db:migrate       # apply\n\n' +
      '  If one of these IS already applied by hand, the ledger is missing its\n' +
      '  row — stamp it rather than silencing this check, so the ledger keeps\n' +
      '  meaning what it claims to mean.'
  );
}

console.log(`✓ All ${files.length} migration(s) have a ledger row on ${redactedHost}.`);
console.log(
  '  This says every migration was applied — not that each one had its intended\n' +
    '  effect. For that, read the object back from the live catalog and prove a\n' +
    '  constraint by making it reject something.\n'
);

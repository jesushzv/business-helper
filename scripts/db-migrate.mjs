#!/usr/bin/env node
/**
 * Applies the SQL migrations in supabase/migrations/ to a target database.
 *
 * Migrations were previously a documented shell command that lived only in
 * docs/deployment.md, which meant the step was easy to forget entirely. Vercel
 * auto-deploys `main` on merge but never touches the database, so a merge alone
 * ships code against the old schema — new columns missing, and any policy the
 * migration was meant to drop still live.
 *
 * This wraps the same `supabase db push` invocation the deployment guide
 * describes, adds a dry run, and refuses to run without an explicit target so
 * nobody points it at the wrong database by accident.
 *
 *   npm run db:migrate:dry     # show what would be applied
 *   npm run db:migrate         # apply
 *
 * Requires SUPABASE_DB_URL, e.g.
 *   postgres://postgres:<password>@<host>:5432/postgres
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!existsSync(MIGRATIONS_DIR)) {
  fail(`No migrations directory at ${MIGRATIONS_DIR}`);
}

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrations.length === 0) {
  console.log('No migrations to apply.');
  process.exit(0);
}

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  fail(
    'SUPABASE_DB_URL is not set.\n\n' +
      '  Get the connection string from Supabase → Project Settings → Database.\n' +
      '  export SUPABASE_DB_URL="postgres://postgres:<password>@<host>:5432/postgres"\n\n' +
      '  Refusing to guess a target — applying migrations to the wrong database\n' +
      '  is not something you can undo.'
  );
}

// Never print the URL: it carries the database password.
const redactedHost = (() => {
  try {
    return new URL(dbUrl).host;
  } catch {
    return '<unparseable host>';
  }
})();

console.log(`\nMigrations found (${migrations.length}):`);
for (const m of migrations) console.log(`  • ${m}`);
console.log(`\nTarget: ${redactedHost}`);
console.log(dryRun ? '\nDry run — nothing will be applied.\n' : '\nApplying…\n');

const args = ['--yes', 'supabase', 'db', 'push', '--db-url', dbUrl];
if (dryRun) args.push('--dry-run');

const result = spawnSync('npx', args, { stdio: 'inherit' });

if (result.error) {
  fail(`Could not run the Supabase CLI: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(`supabase db push exited with code ${result.status}`);
}

console.log(
  dryRun
    ? '\n✓ Dry run complete.\n'
    : '\n✓ Migrations applied. Deploy the application code now — not before.\n'
);

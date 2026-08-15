import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every live table has a section in `database-schema-design.md` (#156).
 *
 * `CLAUDE.md` sends agents to that document to check column names *before*
 * writing SQL, and the doc has been wrong about columns before: #96 shipped
 * four modules reading three `clients.credit_*` columns no migration ever
 * created, rendering "$0 límite, Activo" for every client in production.
 *
 * A table with no section is the same hazard one step earlier. `otp_send_log`
 * was undocumented for its whole life, and its `phone_e164` column now holds
 * **emails** on the launch channel — so an agent reading only the column name
 * would reasonably write a phone-shaped filter or CHECK against it. That fact
 * lived in a migration comment and a `COMMENT ON COLUMN`, in neither of the
 * places the operating guide points at.
 *
 * The set is derived from the migration files — created minus dropped — rather
 * than listed, so a new table is covered the day it is created rather than the
 * day someone remembers this test. `csd_credentials` is the reason the DROP
 * half matters: created by the initial schema, dropped by the PAC migration,
 * and correctly absent from the doc.
 */

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const SCHEMA_DOC = join(ROOT, 'docs', '02-architecture', 'database-schema-design.md');

/** Tables that exist after every migration has been applied, in order. */
function liveTables(): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const live = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

    for (const match of sql.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)/gi
    )) {
      live.add(match[1]);
    }
    for (const match of sql.matchAll(/DROP TABLE (?:IF EXISTS )?public\.([a-z_]+)/gi)) {
      live.delete(match[1]);
    }
  }
  return [...live].sort();
}

describe('database-schema-design.md covers the live schema (#156)', () => {
  it('parses a plausible set of tables from the migrations', () => {
    // A regex that stopped matching would make every assertion below vacuous.
    const tables = liveTables();
    expect(
      tables.length,
      `Parsed only ${tables.length} tables from supabase/migrations — the CREATE TABLE ` +
        'pattern stopped matching, so the coverage check below is checking nothing.'
    ).toBeGreaterThanOrEqual(14);
    expect(tables).toContain('organizations');
    expect(tables).toContain('milestones');
  });

  it('drops tables that were later dropped', () => {
    // The DROP half is load-bearing: without it this test would demand a
    // section for a table that no longer exists, and the honest fix would be
    // to document a table nobody can query.
    expect(liveTables()).not.toContain('csd_credentials');
  });

  it('documents every live table with its own section', () => {
    const doc = readFileSync(SCHEMA_DOC, 'utf8');
    const undocumented = liveTables().filter(
      (table) => !new RegExp(`^####\\s+\`${table}\``, 'm').test(doc)
    );

    expect(
      undocumented,
      `These tables exist after all migrations but have no \`#### \`table\`\` section in ` +
        `docs/02-architecture/database-schema-design.md: ${undocumented.join(', ')}.\n` +
        'CLAUDE.md sends agents there to check column names before writing SQL, so a missing ' +
        'table means they check nothing and guess from the column name instead (#156, #96).'
    ).toEqual([]);
  });

  it('warns that otp_send_log.phone_e164 is not a phone number', () => {
    // The specific trap #156 was filed for. The column name says E.164; on the
    // email launch channel it holds a lowercased email address, and the name is
    // kept only to survive the deploy-before-migrate window.
    const doc = readFileSync(SCHEMA_DOC, 'utf8');
    const section = doc.slice(doc.indexOf('#### `otp_send_log`'));
    const columnEntry = section.slice(0, section.indexOf('#### `stripe_webhook_events`'));

    expect(columnEntry).toMatch(/phone_e164/);
    expect(
      columnEntry,
      'The otp_send_log section must say that phone_e164 holds an email on the launch ' +
        'channel — the whole reason #156 was filed.'
    ).toMatch(/email/i);
  });
});

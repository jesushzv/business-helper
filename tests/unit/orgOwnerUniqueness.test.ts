import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describeDbWriteError } from '@/lib/dbWriteError';

/**
 * #109/#168 — one organization per owner, now a schema invariant.
 *
 * `organizations.owner_id` had no index and no uniqueness: only the FK to
 * `auth.users`. The write path assumed uniqueness anyway —
 * `.eq('owner_id', userId).maybeSingle()` fails PostgREST's singular-response
 * check with two rows, so a two-organization owner would be told **their
 * business does not exist** on every settlement-account save. The only thing
 * preventing it was UI behaviour standing in for a constraint.
 *
 * Two halves are tested here: the migration says what it should, and the new
 * failure it makes reachable reads like a sentence rather than a 500.
 *
 * The constraint's *behaviour* is proven where a constraint can actually be
 * proven — `supabase/ci/assertions.sql` attempts the duplicate INSERT and fails
 * the build if Postgres accepts it. A string match on SQL is not a check on a
 * database.
 */

const MIGRATIONS = join('supabase', 'migrations');
const MIGRATION = '20260811150000_organizations_owner_id_unique.sql';

describe('the migration that makes one-org-per-owner real', () => {
  it('exists and creates the unique index idempotently', () => {
    const files = readdirSync(MIGRATIONS);
    expect(files, 'the migration file was renamed or removed').toContain(MIGRATION);

    const sql = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8');

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_owner_id\s+ON public\.organizations \(owner_id\)/
    );
  });

  it('does not also create a redundant non-unique index on the same column', () => {
    // #168's sketch proposed both. A unique btree on (owner_id) already serves
    // `owner_id = $1`, so a second index is write amplification for nothing.
    const sql = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8');
    const nonUnique = /CREATE INDEX(?! UNIQUE)[^;]*organizations[^;]*\(owner_id\)/i.test(sql);

    expect(nonUnique, 'a plain index on owner_id duplicates the unique one').toBe(false);
  });

  it('is the only migration that touches owner_id uniqueness', () => {
    // A second migration dropping or recreating it would make the invariant
    // depend on file order — and the catalog, not the repo, would be the only
    // place to learn the truth.
    const touching = readdirSync(MIGRATIONS).filter((file) =>
      /uq_organizations_owner_id/.test(readFileSync(join(MIGRATIONS, file), 'utf8'))
    );

    expect(touching).toEqual([MIGRATION]);
  });

  it('the CI assertions prove the constraint by making it reject something', () => {
    const assertions = readFileSync(join('supabase', 'ci', 'assertions.sql'), 'utf8');

    // The negative check: a second organization for the seeded owner.
    expect(assertions).toMatch(/WHEN unique_violation THEN/);
    expect(assertions).toMatch(/uq_organizations_owner_id/);
    // …and a positive control on the index being unique, not merely present.
    expect(assertions).toMatch(/indisunique/);
  });
});

describe('the 23505 an owner can now actually hit', () => {
  const duplicateOwner = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_organizations_owner_id"',
    details: 'Key (owner_id)=(11111111-1111-1111-1111-111111111111) already exists.',
  };

  it('tells the owner they already have a business, and that nothing was lost', () => {
    const failure = describeDbWriteError(duplicateOwner, 'una organización', 'POST /api/organization');

    expect(failure.status).toBe(409);
    expect(failure.code).toBe('ORGANIZATION_EXISTS');
    expect(failure.message).toContain('ya tiene un negocio registrado');
    expect(failure.message).toContain('No se creó uno nuevo');
    // Hard rule 8: no constraint names, no SQLSTATE, no jargon on screen.
    expect(failure.message).not.toMatch(/uq_|23505|unique|constraint/i);
  });

  it('does not reuse the generic wording, which is nonsense for this table', () => {
    // "Ya existe una organización con esos datos en tu organización."
    const failure = describeDbWriteError(duplicateOwner, 'una organización', 'POST /api/organization');
    expect(failure.message).not.toContain('en tu organización');
  });

  it('leaves every other duplicate on the generic path', () => {
    const otherDuplicate = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "clients_org_rfc_key"',
    };
    const failure = describeDbWriteError(otherDuplicate, 'un cliente', 'POST /api/clients');

    expect(failure.code).toBe('DUPLICATE');
    expect(failure.status).toBe(409);
  });

  it('is wired into the route, not just available to it', () => {
    const route = readFileSync(join('app', 'api', 'organization', 'route.ts'), 'utf8');

    // The old body answered every insert failure with one 500 and nine words.
    expect(route).not.toMatch(
      /code: 'SERVER_ERROR', message: 'No se pudo crear la organización'/
    );
    expect(route).toMatch(/describeDbWriteError\(error, 'una organización'/);
  });
});

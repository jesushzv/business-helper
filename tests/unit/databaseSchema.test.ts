import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The initial migration is the one that creates every tenant-scoped table. The
// later migrations harden it (see securityHardening.test.ts); this file asserts
// the base multi-tenant shape is still there — a table that ships without RLS
// is readable across organizations.
const schema = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260803000000_initial_schema.sql'),
  'utf8'
);

const TENANT_TABLES = [
  'organization_members',
  'clients',
  'products',
  'quotes',
  'contracts',
  'milestones',
  'audit_logs',
] as const;

const ALL_TABLES = ['organizations', 'csd_credentials', ...TENANT_TABLES] as const;

describe('Initial schema migration', () => {
  it.each(ALL_TABLES)('defines table %s', (table) => {
    const created =
      schema.includes(`CREATE TABLE IF NOT EXISTS public.${table}`) ||
      schema.includes(`CREATE TABLE public.${table}`);

    expect(created).toBe(true);
  });

  it.each(ALL_TABLES)('enables row level security on %s', (table) => {
    expect(schema).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  });

  it.each(TENANT_TABLES)('scopes %s to an organization', (table) => {
    const definition = schema.slice(schema.indexOf(`public.${table} (`));
    const body = definition.slice(0, definition.indexOf(');'));

    expect(body.toLowerCase()).toContain('organization_id uuid');
  });

  it('defines the auth.user_organization_ids() helper the policies depend on', () => {
    expect(schema).toContain('user_organization_ids');
  });

  it('gates public quote access on a token rather than leaving the table open', () => {
    expect(schema).toContain('public_token');
  });
});

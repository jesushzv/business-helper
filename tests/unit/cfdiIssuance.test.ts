import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the property this change exists to establish: the product never
 * records a CFDI it did not obtain from a PAC.
 *
 * The failure was not a missing feature but a fabricated one —
 * `simulateInvoiceStamping` invented a folio and two storage.businesshelper.mx
 * URLs, and the route wrote them as `cfdi_status: 'issued'`. These assertions
 * read the source so a reintroduced fallback fails here rather than in a
 * taxpayer's accounting.
 */

function read(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), 'utf8');
}

const migration = read('supabase', 'migrations', '20260807120000_cfdi_pac_integration.sql');
const issueRoute = read('app', 'api', 'invoices', 'issue', 'route.ts');

describe('CFDI issuance has no simulated path', () => {
  it('does not fabricate a stamp anywhere in the app or lib source', () => {
    const sources = [
      issueRoute,
      read('lib', 'facturapi.ts'),
      read('lib', 'pacClient.ts'),
      read('lib', 'hooks', 'useInvoices.ts'),
      read('components', 'invoices', 'InvoiceManagerCard.tsx'),
    ];

    // These files name the old behaviour in their comments, which is the point
    // of those comments. What must not come back is a call to the simulation or
    // a literal pointing at the host that served none of those documents.
    for (const source of sources) {
      expect(source).not.toMatch(/simulateInvoiceStamping\s*\(/);
      expect(source).not.toMatch(/import[^;]*simulateInvoiceStamping/);
      expect(source).not.toMatch(/https:\/\/storage\.businesshelper\.mx/);
    }
  });

  it('stamps through the PAC client rather than a local helper', () => {
    expect(issueRoute).toContain("from '@/lib/pacClient'");
    expect(issueRoute).toContain('stampInvoice(');
  });

  it('records a failed attempt as failed', () => {
    expect(issueRoute).toContain("cfdi_status: 'failed'");
    expect(issueRoute).not.toContain("cfdi_status: 'simulated'");
  });

  it('refuses to stamp a milestone that already carries a folio fiscal', () => {
    expect(issueRoute).toContain('ALREADY_ISSUED');
  });

  it('refuses a PAC sandbox key in production', () => {
    expect(issueRoute).toContain('PAC_SANDBOX_KEY');
  });

  it('checks the issue_cfdi capability before spending a folio', () => {
    expect(issueRoute).toContain("hasCapability(role, 'issue_cfdi')");
  });
});

describe('CFDI integration migration', () => {
  it('creates the PAC connection table with owner-only access', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.pac_connections');
    expect(migration).toContain('ALTER TABLE public.pac_connections ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('WHERE owner_id = auth.uid()');
  });

  it('stores the PAC key sealed and never in plaintext', () => {
    expect(migration).toContain('api_key_sealed text NOT NULL');
    expect(migration).not.toContain('api_key text NOT NULL');
  });

  it('drops csd_credentials, which nothing may ever populate', () => {
    // docs/02-architecture/cfdi_integration_architecture.md §02: the user's CSD
    // stays with their PAC. A table shaped to hold private keys is an invitation.
    expect(migration).toContain('DROP TABLE IF EXISTS public.csd_credentials;');
  });

  it('moves folios through functions rather than read-modify-write', () => {
    expect(migration).toContain('FUNCTION public.reserve_cfdi_folio');
    expect(migration).toContain('FUNCTION public.release_cfdi_folio');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.reserve_cfdi_folio(uuid, text, integer) TO service_role;');
  });

  it('quarantines the fabricated stamps already recorded as issued', () => {
    expect(migration).toContain("cfdi_xml_url LIKE '%storage.businesshelper.mx%'");
    expect(migration).toContain('nunca se emitió ante el SAT');
  });

  it('leaves no room in the status domain for a simulated stamp', () => {
    // 'simulated' appears only in the quarantine WHERE clause, never in the
    // domain a future write could land in.
    expect(migration).toContain(
      "CHECK (cfdi_status IN ('none', 'pending', 'issued', 'failed', 'cancelled'))"
    );
  });

  it('keeps the CFDI document bucket private', () => {
    expect(migration).toContain("VALUES ('cfdi-documents', 'cfdi-documents', false)");
  });
});

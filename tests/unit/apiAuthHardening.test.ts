import { describe, it, expect } from 'vitest';
import {
  pickFields,
  QUOTE_WRITABLE_FIELDS,
  MILESTONE_WRITABLE_FIELDS,
  CLIENT_WRITABLE_FIELDS,
} from '@/lib/apiAuth';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Regression tests for the P1 auth and IDOR pass.
 */

/**
 * Strips comments before pattern-matching source.
 *
 * These tests assert that removed patterns are gone, and the routes document
 * what they used to do — so a comment quoting the old code would otherwise
 * fail the very test that proves it was fixed.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('mass-assignment defense', () => {
  it('drops fields not on the whitelist', () => {
    const result = pickFields(
      {
        title: 'Cotización',
        total_amount: 1000,
        organization_id: 'attacker-org',
        created_by: 'attacker-user',
        public_token: 'hijacked',
        id: 'other-quote',
      },
      QUOTE_WRITABLE_FIELDS
    );

    expect(result).toEqual({ title: 'Cotización', total_amount: 1000 });
    expect(result).not.toHaveProperty('organization_id');
    expect(result).not.toHaveProperty('created_by');
    expect(result).not.toHaveProperty('public_token');
    expect(result).not.toHaveProperty('id');
  });

  it('never allows organization_id through any whitelist', () => {
    for (const fields of [QUOTE_WRITABLE_FIELDS, MILESTONE_WRITABLE_FIELDS, CLIENT_WRITABLE_FIELDS]) {
      expect(fields).not.toContain('organization_id');
      expect(fields).not.toContain('id');
    }
  });

  it('does not resurrect the OTP or signature columns as writable', () => {
    const forbidden = [
      'client_otp_hash',
      'client_otp_verified',
      'client_otp_attempts',
      'contract_hash',
      'accepted_at',
      'accepted_ip',
    ];
    for (const field of forbidden) {
      expect(QUOTE_WRITABLE_FIELDS).not.toContain(field);
    }
  });

  it('omits keys that are absent or undefined rather than nulling them', () => {
    expect(pickFields({ title: 'x', notes: undefined }, QUOTE_WRITABLE_FIELDS)).toEqual({ title: 'x' });
  });

  it('tolerates non-object bodies', () => {
    expect(pickFields(null, QUOTE_WRITABLE_FIELDS)).toEqual({});
    expect(pickFields('string', QUOTE_WRITABLE_FIELDS)).toEqual({});
    expect(pickFields(42, QUOTE_WRITABLE_FIELDS)).toEqual({});
  });

  it('ignores prototype-chain properties', () => {
    const hostile = Object.create({ title: 'inherited' });
    expect(pickFields(hostile, QUOTE_WRITABLE_FIELDS)).toEqual({});
  });
});

describe('every API route is authenticated or explicitly public', () => {
  const apiDir = join(process.cwd(), 'app', 'api');

  function collectRoutes(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collectRoutes(full, found);
      else if (entry === 'route.ts') found.push(full);
    }
    return found;
  }

  /**
   * Routes reachable without a session, each for a stated reason. Adding to
   * this list is a deliberate act; anything else must call an auth helper.
   */
  const INTENTIONALLY_PUBLIC = new Set([
    'quotes/public/[token]/route.ts',      // shared quote link, scoped by token
    'quotes/public/[token]/otp/route.ts',  // issues an OTP for the above
    'receivables/public/[token]/route.ts', // shared payment link, scoped by token
    'receivables/public/[token]/upload/route.ts', // receipt upload for the above (#85): token-scoped, magic-byte checked, 5MB cap
    'stripe/webhook/route.ts',             // authenticated by HMAC signature
    'health/route.ts',                     // liveness probe
  ]);

  const routes = collectRoutes(apiDir);

  it('finds the API routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it.each(routes)('%s enforces auth or is listed as public', (routePath) => {
    const rel = routePath.split(`${join('app', 'api')}/`)[1] ?? routePath;
    const source = stripComments(readFileSync(routePath, 'utf8'));

    if (INTENTIONALLY_PUBLIC.has(rel)) {
      return;
    }

    const guarded = /requireOrgAccess|requireUser/.test(source);
    expect(guarded, `${rel} has no auth guard and is not listed as intentionally public`).toBe(true);
  });

  it('no route bypasses auth via a NEXT_PUBLIC_ flag', () => {
    // NEXT_PUBLIC_DEMO_MODE previously disabled the check on the WhatsApp
    // broadcast route. Client-visible build flags must not gate server auth.
    for (const routePath of routes) {
      const source = stripComments(readFileSync(routePath, 'utf8'));
      expect(
        /NEXT_PUBLIC_DEMO_MODE/.test(source),
        `${routePath} gates behavior on NEXT_PUBLIC_DEMO_MODE`
      ).toBe(false);
    }
  });
});

describe('money-path routes do not fabricate success', () => {
  const cases: Array<[string, RegExp]> = [
    // Each previously returned a success payload on a failed or zero-row write.
    ['app/api/quotes/[id]/route.ts', /\{ id, \.\.\.body/],
    ['app/api/receivables/[id]/route.ts', /catch\s*\{\s*return NextResponse\.json\(\{\s*success: true/],
    ['app/api/quotes/[id]/convert/route.ts', /mockQuote/],
    ['app/api/receivables/[id]/upload/route.ts', /mockUrl/],
    ['app/api/organization/route.ts', /Demo response fallback/],
  ];

  it.each(cases)('%s no longer contains its fabricated-success path', (file, pattern) => {
    const source = stripComments(readFileSync(join(process.cwd(), file), 'utf8'));
    expect(pattern.test(source)).toBe(false);
  });

  it('the CFDI endpoint records a stamp only when a PAC returned a folio fiscal', () => {
    // The interim mitigation wrote `cfdi_status: 'simulated'` because nothing
    // was issued. Now something is: 'issued' may be written, but only alongside
    // the UUID that came back from the PAC.
    const source = stripComments(
      readFileSync(join(process.cwd(), 'app/api/invoices/issue/route.ts'), 'utf8')
    );
    expect(source).not.toContain("cfdi_status: 'simulated'");
    expect(source).toContain('stampInvoice(');
    expect(source).toMatch(/cfdi_uuid: document\.uuid[\s\S]{0,240}cfdi_status: 'issued'/);
  });
});

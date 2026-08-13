import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Placeholder identifiers are hard rule #1 wearing a UI costume (#44, #78,
 * #106): `token || 'demo'` and `phone || '8115551234'` each render as a live,
 * tappable control for a real tenant — a /pay/demo link an owner copies to a
 * client, a stranger's phone receiving a signing link. Absent is absent: the
 * control renders disabled, naming the record the tenant must fix.
 *
 * This scans for the shape rather than the strings: any `||` / `??` fallback
 * whose right-hand side is a demo-flavoured literal or a bare phone-length
 * number, in code that ships to app/, components/ or lib/.
 */

const ROOTS = ['app', 'components', 'lib'];

// The shapes that have actually shipped, plus the obvious neighbours:
//   || 'demo'      || "demo_token"   ?? 'demo'      || '8115551234'
const FALLBACK_PATTERN = /(\|\||\?\?)\s*['"`](demo[\w-]*|[0-9]{10,13})['"`]/;

/**
 * CFDI-identity fields (#179, the #96 `regimen_fiscal || '601'` shape): rfc,
 * regimen_fiscal and codigo_postal are SAT-registry facts with no legitimate
 * default — the columns have none, and `validateInvoiceParties` refuses to
 * stamp without them. A short catalog literal filled in for one of these
 * renders an identity nobody established, so any `||` / `??` fallback to a
 * catalog-shaped literal (SAT codes, postal codes, RFCs) on these fields
 * fails the build. Spanish absent-labels (`|| 'Sin RFC'`) stay legal — the
 * literal must look like a catalog value, not copy.
 *
 * Deliberately NOT listed, same as `sat_product_code` below:
 *   - cfdi_use — the column carries a DEFAULT 'G03' by design (see
 *     app/api/clients/route.ts), so a G03 fallback restates the schema.
 */
const CFDI_IDENTITY_FIELDS = ['rfc', 'regimen_fiscal', 'codigo_postal'];
const CFDI_IDENTITY_PATTERN = new RegExp(
  '\\b(?:' +
    CFDI_IDENTITY_FIELDS.join('|') +
    ")\\b[^|?\\n]*(?:\\|\\||\\?\\?)\\s*['\"`](?:[0-9A-Z]{2,5}|[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3})['\"`]"
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('no placeholder identifier ever fills an absent value (#106)', () => {
  it('no || / ?? fallback to a demo or phone-number literal in shipped code', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = file.replace(process.cwd() + '/', '');
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const trimmed = line.trim();
          // History lives in comments on purpose; only code counts.
          if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('{/*')
          ) {
            return;
          }
          if (FALLBACK_PATTERN.test(line) || CFDI_IDENTITY_PATTERN.test(line)) {
            offenders.push(`${rel}:${i + 1}: ${trimmed}`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  // An absence assertion must be shown to catch what it exists for (rule 7).
  // These pin the historical offender shapes verbatim.
  it('the pattern catches the shapes that actually shipped', () => {
    expect(FALLBACK_PATTERN.test("const clientPhone = client?.phone || '8115551234';")).toBe(true);
    expect(FALLBACK_PATTERN.test("public_token: m.public_token || 'demo',")).toBe(true);
    expect(FALLBACK_PATTERN.test('const t = id ?? "demo_token";')).toBe(true);
  });

  it('the pattern leaves legitimate fallbacks alone', () => {
    expect(FALLBACK_PATTERN.test("const unit = input.unit || 'E48';")).toBe(false);
    expect(FALLBACK_PATTERN.test("const status = row.status ?? 'pending';")).toBe(false);
    expect(FALLBACK_PATTERN.test("const name = org?.name || '';")).toBe(false);
    // SAT product codes are 8 digits — under the phone-length floor.
    expect(FALLBACK_PATTERN.test("sat_product_code: p.code || '84111506',")).toBe(false);
  });

  it('the CFDI-identity pattern catches short catalog defaults on identity fields (#179)', () => {
    // The exact #96 shape the old gate could not see:
    expect(CFDI_IDENTITY_PATTERN.test("regimen_fiscal: c.regimen_fiscal || '601',")).toBe(true);
    expect(CFDI_IDENTITY_PATTERN.test("const orgRfc = tenantOrg?.rfc || 'XAXX010101000';")).toBe(
      true
    );
    expect(CFDI_IDENTITY_PATTERN.test('codigo_postal: row.codigo_postal ?? "06600",')).toBe(true);
  });

  it('the CFDI-identity pattern leaves absent-labels, empties and defaulted fields alone', () => {
    // Spanish copy naming the absence is the fix, not the defect:
    expect(CFDI_IDENTITY_PATTERN.test("<span>RFC: {client.rfc || 'Sin RFC registrado'}</span>")).toBe(
      false
    );
    // Empty string renders absent — that is the point:
    expect(CFDI_IDENTITY_PATTERN.test("tax_system: receiver.regimen_fiscal || '',")).toBe(false);
    // cfdi_use carries a DB DEFAULT 'G03' by design — a fallback restates the schema:
    expect(CFDI_IDENTITY_PATTERN.test("use: receiver.cfdi_use || 'G03',")).toBe(false);
    // sat_product_code stays a deliberate convenience (see above):
    expect(CFDI_IDENTITY_PATTERN.test("sat_product_code: p.code || '84111506',")).toBe(false);
  });
});

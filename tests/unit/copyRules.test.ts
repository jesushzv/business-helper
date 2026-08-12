import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { authErrorMessage, userFacingMessage } from '@/lib/errorCopy';

/**
 * #103 — hard rule #8 as a gate: Mexican Spanish, plain language, benefit
 * claims. Never developer jargon.
 *
 * The audit found RBAC as a mobile page title, SHA-256 and the raw 64-char
 * digest printed to the buyer, "Row Level Security en PostgreSQL" in the
 * Aviso de Privacidad, English badges, and Supabase's English error text
 * concatenated into Spanish sentences.
 *
 * The scan is over *rendered* copy: JSX text and the string tables the UI maps
 * over. It deliberately does not read comments or identifiers — `teamRBAC.ts`
 * is a fine module name, and the rule is about what a tenant sees.
 */

const UI_ROOTS = ['app', 'components'];
/** String tables whose contents are rendered verbatim by the UI. */
const COPY_MODULES = [
  'lib/tierFeaturesData.ts',
  'lib/trustData.ts',
  'lib/helpFAQ.ts',
  // STRIPE_PLANS.*.features is the "Incluye:" list on the Ajustes billing
  // card — the copy a tenant reads at the moment of payment (#225 review).
  'lib/stripe.ts',
];

/** Jargon that must never appear in something a tenant reads. */
const BANNED = [
  'RBAC',
  'SHA-256',
  'SHA256',
  'HMAC',
  'Row Level Security',
  'Multitenant',
  'multitenant',
  'PostgreSQL',
  'Supabase',
  'Sandbox',
  'TLS 1.3',
  'Webhooks',
  'Health Score',
  'Kanban',
  'Cash Flow',
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(path));
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/**
 * Source reduced to what a tenant could actually read.
 *
 * Comments go (prose about a defect is not the defect), and so do import
 * statements and dotted/identifier uses — `teamRBAC.ts` is a fine module name
 * and `isSupabaseConfigured()` is a function. The rule is about rendered copy,
 * so a term only counts when it is not glued to identifier characters.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import\s[^;]*;?$/gm, '');
}

/** Does `term` appear as copy rather than as part of an identifier? */
function rendersTerm(src: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_.])${escaped}(?![A-Za-z0-9_])`, 'm').test(src);
}

const files = [...UI_ROOTS.flatMap((r) => tsxFiles(r)), ...COPY_MODULES];

describe('user-facing copy (#103)', () => {
  it('scanned a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('renders no developer jargon', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = code(readFileSync(file, 'utf8'));
      for (const term of BANNED) {
        // `isSandbox`/`cfdiEnvironment === 'sandbox'` are identifiers and a PAC
        // environment value, not copy; the capitalised label is what shipped.
        if (term === 'Sandbox' && !/[>"'\s]Sandbox/.test(src)) continue;
        if (rendersTerm(src, term)) offenders.push(`${file}: ${term}`);
      }
    }
    expect(
      offenders,
      'Hard rule #8: benefit claims, never developer jargon. "Evidencia Legal Certificada" is the ' +
        'framing the brand guidelines name for the crypto terms.'
    ).toEqual([]);
  });

  it('never concatenates a provider error into a Spanish sentence', () => {
    // 'Ocurrió un error al registrar la cuenta: ' + authError.message
    const offenders: string[] = [];
    for (const file of files) {
      const src = code(readFileSync(file, 'utf8'));
      if (/'\s*\+\s*\w*[eE]rror\.message/.test(src) || /\+\s*authError\.message/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders, 'Map to a fixed Spanish string and log the original — lib/errorCopy.ts').toEqual(
      []
    );
  });

  it('keeps one register: tú, including the client-facing portals', () => {
    // The quote portal was usted and the payment portal mixed both, so a
    // client crossing from signing to paying saw the register flip.
    const ustedForms = /\b(Intente|Revise|Verifique|Ingrese|Seleccione|Complete) \b/;
    const offenders: string[] = [];
    for (const file of UI_ROOTS.flatMap((r) => tsxFiles(r))) {
      const src = code(readFileSync(file, 'utf8'));
      const m = src.match(ustedForms);
      if (m) offenders.push(`${file}: ${m[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * #221 — the BYOK decision (docs/STATUS.md §05, PR #220): tenants stamp with
 * their own PAC account and their provider bills them for it. The platform
 * never stamps on a tenant's behalf, so there is no folio allowance to include
 * in a plan, no per-folio price to charge, and no add-on pack to sell. Copy
 * promising any of those is a commercial claim with no billable event behind
 * it.
 */
const FOLIO_CLAIMS: Array<{ pattern: RegExp; means: string }> = [
  { pattern: /\d+\s*folios\b/i, means: 'a folio count ("10 folios/mes", "50 folios por $100")' },
  { pattern: /folios?\s+incluid/i, means: 'folios included in a plan' },
  { pattern: /incluye\s+\d+\s*folios?/i, means: 'a plan including folios' },
  { pattern: /MXN\s*\/?\s*(por\s+)?folio/i, means: 'a per-folio price in MXN' },
  { pattern: /por\s+folio\s+adicional/i, means: 'a per-extra-folio price' },
  { pattern: /folios?\s*\/\s*mes/i, means: 'a monthly folio allowance' },
  { pattern: /paquetes?\s+de\s+folios/i, means: 'folio add-on packs' },
  { pattern: /folios\s+de\s+tu\s+plan/i, means: 'a plan folio meter' },
  { pattern: /folios(\s+extra)?\s*×/i, means: 'a folio cost computation' },
];

describe('no folio-inclusion claims (#221)', () => {
  it('renders no folio allowance, per-folio price, or folio pack', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = code(readFileSync(file, 'utf8'));
      for (const { pattern, means } of FOLIO_CLAIMS) {
        const m = src.match(pattern);
        if (m) offenders.push(`${file}: "${m[0]}" (${means})`);
      }
    }
    expect(
      offenders,
      'BYOK (#221): every tier stamps through the tenant’s own PAC and the PAC bills them — ' +
        'nothing meters, includes, or resells folios. "Folio fiscal" (the SAT UUID) is fine; a ' +
        'count, price, or pack of folios is a dead billing model.'
    ).toEqual([]);
  });
});

describe('errorCopy (#103 §3)', () => {
  it('maps a known provider message to Spanish', () => {
    expect(authErrorMessage(new Error('User already registered'), 'fallback')).toContain(
      'ya tiene una cuenta'
    );
    expect(authErrorMessage(new Error('Invalid login credentials'), 'fallback')).toContain(
      'incorrectos'
    );
  });

  it('falls back rather than guessing at an unmapped provider message', () => {
    // Guessing is how a user gets told the wrong thing to do.
    const fallback = 'No pudimos crear tu cuenta.';
    expect(authErrorMessage(new Error('Some new GoTrue string'), fallback)).toBe(fallback);
  });

  it('never returns the raw provider text', () => {
    const out = authErrorMessage(new Error('User already registered'), 'fallback');
    expect(out).not.toContain('User already registered');
  });

  it('replaces the browser network error everywhere it can surface', () => {
    for (const raw of ['Failed to fetch', 'NetworkError when attempting to fetch resource', 'Load failed']) {
      expect(userFacingMessage(new Error(raw), 'fb')).toContain('conexión a internet');
      expect(authErrorMessage(new Error(raw), 'fb')).toContain('conexión a internet');
    }
  });

  it('passes our own Spanish through untouched', () => {
    // ClientWriteError and the hooks already write for this audience.
    const ours = 'El RFC no tiene el formato que pide el SAT.';
    expect(userFacingMessage(new Error(ours), 'fb')).toBe(ours);
  });

  it('falls back on an empty message', () => {
    expect(userFacingMessage(new Error(''), 'fb')).toBe('fb');
    expect(userFacingMessage(null, 'fb')).toBe('fb');
  });
});

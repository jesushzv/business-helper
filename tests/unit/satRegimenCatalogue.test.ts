import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  SAT_REGIMENES,
  findSatRegimen,
  satRegimenOptions,
  toRegimenCode,
} from '@/lib/satRegimenes';

/**
 * #127 — four screens, four different régimen lists.
 *
 * A tenant who registered under 606 (offered at `/register`) opened Ajustes,
 * whose list omitted 606, and saw a blank select: no option matched the stored
 * value, and the "Selecciona tu régimen" placeholder only renders for `''`. The
 * régimen is what a CFDI is stamped under, so the next dropdown touch would
 * have replaced a correct fiscal fact with a wrong one.
 *
 * Two gates below: the catalogue is the only copy, and a stored code the
 * catalogue does not list stays visible instead of vanishing.
 */

const ROOTS = ['app', 'components', 'lib'];
const CATALOGUE_FILE = join('lib', 'satRegimenes.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('the SAT régimen catalogue has exactly one copy', () => {
  const sources = ROOTS.flatMap((root) => walk(root)).filter(
    (file) => file !== CATALOGUE_FILE
  );

  it('scans a plausible number of files', () => {
    // A scan that silently matched nothing is indistinguishable from a passing
    // one (CLAUDE.md rule 7), so the sweep asserts it actually swept.
    expect(sources.length).toBeGreaterThan(50);
  });

  it('declares no régimen option outside lib/satRegimenes.ts', () => {
    // `{ code: '601', label: … }` is the shape all four copies took. CFDI use
    // codes ('G03', 'P01') are alphanumeric and do not match.
    const pattern = /code:\s*['"]6\d{2}['"]/;
    const offenders = sources.filter((file) => pattern.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('imports the catalogue in every screen that offers a régimen', () => {
    const screens = [
      join('app', '(auth)', 'register', 'page.tsx'),
      join('app', 'onboarding', 'page.tsx'),
      join('components', 'settings', 'OrgProfileCard.tsx'),
      join('components', 'clients', 'ClientFormModal.tsx'),
    ];

    for (const screen of screens) {
      const source = readFileSync(screen, 'utf8');
      expect(source, screen).toMatch(/from '@\/lib\/satRegimenes'/);
      // The options come from the helper, so an unlisted stored code survives.
      expect(source, screen).toMatch(/satRegimenOptions\(/);
    }
  });

  it('carries every code the four divergent lists used to offer', () => {
    // The union of app/(auth)/register, app/onboarding, OrgProfileCard and
    // ClientFormModal as of #127. Dropping one silently retires a régimen
    // tenants already hold.
    for (const code of ['601', '603', '605', '606', '612', '621', '626']) {
      expect(findSatRegimen(code), code).not.toBeNull();
    }
    expect(SAT_REGIMENES.length).toBeGreaterThanOrEqual(7);
  });

  it('labels every entry with its own code, so the stored value is legible', () => {
    for (const regimen of SAT_REGIMENES) {
      expect(regimen.label.startsWith(regimen.code), regimen.code).toBe(true);
      expect(regimen.code).toMatch(/^\d{3}$/);
    }
  });
});

describe('a stored régimen the catalogue does not list stays visible', () => {
  it('appends the stored code as its own option instead of blanking the select', () => {
    const options = satRegimenOptions('622');
    const stored = options.find((r) => r.code === '622');

    expect(stored).toBeDefined();
    expect(stored?.label).toContain('622');
    expect(stored?.label).toContain('código guardado');
    expect(options).toHaveLength(SAT_REGIMENES.length + 1);
  });

  it('does not duplicate a code the catalogue already lists', () => {
    expect(satRegimenOptions('606')).toHaveLength(SAT_REGIMENES.length);
    expect(satRegimenOptions('606').filter((r) => r.code === '606')).toHaveLength(1);
  });

  it('adds nothing when nothing is stored — absent stays absent', () => {
    for (const empty of ['', null, undefined, '   ']) {
      expect(satRegimenOptions(empty)).toHaveLength(SAT_REGIMENES.length);
    }
  });

  it('accepts the old display-string form the column used to hold', () => {
    expect(toRegimenCode('612 — Personas Físicas con Actividades Empresariales')).toBe('612');
    expect(toRegimenCode('612')).toBe('612');
    expect(toRegimenCode('sin régimen')).toBe('');
    expect(findSatRegimen('601 - General de Ley Personas Morales')?.code).toBe('601');
  });
});

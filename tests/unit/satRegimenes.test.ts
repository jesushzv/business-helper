import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SAT_REGIMENES, findRegimen, regimenOptions } from '@/lib/satRegimenes';

/**
 * #127 — the SAT régimen catalogue, once per screen, four different contents.
 *
 * Registration offered 601/626/612/606/621/603, onboarding four of those,
 * Ajustes a *different* four (the only one with 605, the only one without
 * 606), and the client form six. A tenant who registered under 606 opened
 * Ajustes to a blank select: a `<select>` whose value matches no `<option>`
 * renders empty, and the placeholder only appears for `''`. Touching the
 * dropdown to fix the blank overwrites the régimen their CFDIs are stamped
 * with.
 *
 * The divergence is the defect, so the gate is on the divergence: a régimen
 * catalogue may exist in exactly one file.
 *
 * Verified red before being trusted: restoring a local `REGIMENES_FISCALES`
 * in `OrgProfileCard.tsx` fails `one catalogue`, and dropping 606 from
 * `SAT_REGIMENES` fails `carries every code any screen offered`.
 */

const ROOTS = ['app', 'components'];
const CATALOGUE = 'lib/satRegimenes.ts';

/** Every code the four screens offered before this landed (#127's table). */
const HISTORICALLY_OFFERED = ['601', '603', '605', '606', '612', '621', '626'];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(path));
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('SAT régimen catalogue (#127)', () => {
  it('parsed a plausible catalogue — an empty one would pass every check below', () => {
    expect(SAT_REGIMENES.length).toBeGreaterThanOrEqual(HISTORICALLY_OFFERED.length);
    for (const r of SAT_REGIMENES) {
      expect(r.code).toMatch(/^\d{3}$/);
      expect(r.label.startsWith(r.code)).toBe(true);
      expect(r.name.length).toBeGreaterThan(3);
    }
    // Codes are unique — a duplicate renders two identical options.
    expect(new Set(SAT_REGIMENES.map((r) => r.code)).size).toBe(SAT_REGIMENES.length);
  });

  it('carries every code any screen offered, so no stored régimen goes missing', () => {
    const codes = SAT_REGIMENES.map((r) => r.code);
    for (const code of HISTORICALLY_OFFERED) {
      expect(codes, `${code} was offered somewhere before #127 and must still be listed`).toContain(
        code
      );
    }
  });

  it('keeps one catalogue: no screen may define its own', () => {
    // A régimen code is a bare 3-digit 6xx string in an object literal. CFDI
    // uses (`G03`, `P01`) and unit codes (`E48`) do not match, so this finds
    // régimen lists specifically.
    const offenders = ROOTS.flatMap((r) => tsxFiles(r)).filter((f) =>
      /code:\s*'6\d{2}'/.test(readFileSync(f, 'utf8'))
    );
    expect(
      offenders,
      'A local régimen list re-opens #127 — import SAT_REGIMENES/regimenOptions from @/lib/satRegimenes'
    ).toEqual([]);
  });

  it('is imported by every screen that offers a régimen', () => {
    const screens = ROOTS.flatMap((r) => tsxFiles(r)).filter((f) =>
      /R[ée]gimen Fiscal/i.test(readFileSync(f, 'utf8'))
    );
    // The four from #127's table; if a fifth screen appears it is covered too.
    expect(screens.length).toBeGreaterThanOrEqual(4);
    for (const file of screens) {
      expect(readFileSync(file, 'utf8'), `${file} offers a régimen without the shared list`).toMatch(
        /from '@\/lib\/satRegimenes'/
      );
    }
  });

  it('renders a stored code it does not list as itself, never as nothing', () => {
    // The #127 repro: 621 was offered at registration. Even if the catalogue
    // later drops it, the tenant keeps seeing the régimen they actually have.
    const options = regimenOptions('699');
    expect(options.length).toBe(SAT_REGIMENES.length + 1);

    const extra = options[options.length - 1];
    expect(extra.code).toBe('699');
    expect(extra.label).toContain('699');
    expect(extra.label).toContain('código guardado');
  });

  it('adds nothing for a known code or an empty one', () => {
    expect(regimenOptions('606')).toHaveLength(SAT_REGIMENES.length);
    expect(regimenOptions('')).toHaveLength(SAT_REGIMENES.length);
    expect(regimenOptions(null)).toHaveLength(SAT_REGIMENES.length);
    expect(regimenOptions(undefined)).toHaveLength(SAT_REGIMENES.length);
    // Whitespace is not a régimen.
    expect(regimenOptions('   ')).toHaveLength(SAT_REGIMENES.length);
  });

  it('looks a code up, and answers null rather than guessing', () => {
    expect(findRegimen('626')?.name).toContain('RESICO');
    expect(findRegimen('699')).toBeNull();
    expect(findRegimen('')).toBeNull();
    expect(findRegimen(null)).toBeNull();
  });
});

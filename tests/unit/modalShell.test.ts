import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The scanning gate behind #87 and #100.
 *
 * Both defects were properties of the *overlay*, hand-rolled once per modal:
 * eight `fixed inset-0` divs, none with `role="dialog"`, Escape, or focus
 * management (#100), and six with no `max-h`/`overflow-y-auto`, so a panel
 * taller than the viewport put its submit button out of reach — including the
 * public quote-signing modal with the keyboard open (#87).
 *
 * Fixing the eight does not stop the ninth. So the rule is structural: an
 * overlay is `components/shared/Modal.tsx`, and any file that hand-rolls one
 * fails the build here.
 *
 * Verified red before being trusted (house rule on assertions of absence):
 * planting `fixed inset-0` in a component fails `routes every overlay`, and
 * deleting `aria-modal` from the primitive fails `the primitive itself`.
 */

const ROOTS = ['components', 'app'];

/**
 * The two files allowed to build an overlay directly.
 *
 * `Modal.tsx` is the primitive. `ActionResultDialog.tsx` predates it and is a
 * different control — `role="alertdialog"`, no dismissable content, its own
 * focus handling and test — so it carries the same guarantees inline rather
 * than being reshaped to fit. Both are checked below, not exempted.
 */
const SELF_CONTAINED = [
  'components/shared/Modal.tsx',
  'components/shared/ActionResultDialog.tsx',
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...tsxFiles(path));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

const files = ROOTS.flatMap((root) => tsxFiles(root));
const overlays = files.filter((f) => readFileSync(f, 'utf8').includes('fixed inset-0'));

describe('modal shell (#87 / #100)', () => {
  it('scanned a plausible number of components — an empty scan proves nothing', () => {
    // A scan that silently matches nothing is indistinguishable from one that
    // passes. The repo had 80 .tsx files and 10 overlays when this landed.
    expect(files.length).toBeGreaterThan(50);
    expect(overlays.length).toBeGreaterThanOrEqual(SELF_CONTAINED.length);
  });

  it('routes every overlay through the shared Modal primitive', () => {
    const handRolled = overlays.filter((f) => !SELF_CONTAINED.includes(f));
    expect(
      handRolled,
      'A `fixed inset-0` overlay outside components/shared/Modal.tsx re-opens #87 ' +
        '(no height containment) and #100 (no role/Escape/focus trap). Use <Modal>.'
    ).toEqual([]);
  });

  it('gives the primitive itself a role, an accessible name, Escape, and height containment', () => {
    const source = readFileSync('components/shared/Modal.tsx', 'utf8');
    expect(source).toContain('aria-modal');
    expect(source).toContain('aria-label={title}');
    expect(source).toContain("e.key === 'Escape'");
    expect(source).toContain('max-h-[90vh]');
    expect(source).toContain('overflow-y-auto');
  });

  it('height-contains the one other self-contained overlay', () => {
    for (const file of SELF_CONTAINED) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} must contain its panel height (#87)`).toMatch(/max-h-\[\d+vh\]/);
      expect(source, `${file} must be a dialog to assistive tech (#100)`).toContain('aria-modal');
    }
  });

  it('leaves no unlabeled icon-only close button behind', () => {
    // #100's other half: four icon-only `<X />` closes with no accessible
    // name, plus two `✕` glyphs that also drifted from the lucide icon.
    const glyphs = files.filter((f) => /✕/.test(readFileSync(f, 'utf8')));
    expect(glyphs, 'Close controls come from <Modal>, not a raw ✕ glyph').toEqual([]);
  });
});

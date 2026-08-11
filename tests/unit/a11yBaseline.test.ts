import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #89 / #101 — the touch-target floor and the accessibility baseline.
 *
 * Both were conventions the code did not enforce: 46 sub-48px controls across
 * 19 files against a documented ≥48px rule, and an accessibility pass that
 * found zero `focus-visible` styles, 43 labels pointing at nothing, six inputs
 * with no name at all, and information carried by `text-slate-500` (3.75:1) or
 * by colour alone.
 *
 * These are scanning gates, so they state the rule and fail on the next
 * occurrence anywhere in the tree.
 *
 * A caveat this file is explicit about: jsdom has no layout engine and no
 * cascade, so nothing here proves a control *renders* at 48px or that the
 * focus ring actually paints. It proves the declarations that decide those
 * things are present and have not been reverted. The real check is a device.
 */

const ROOTS = ['app', 'components'];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(path));
    else if (entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const files = ROOTS.flatMap((root) => tsxFiles(root));
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

describe('touch targets (#89)', () => {
  it('scanned a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
    // The rule is only meaningful if the codebase actually declares heights.
    const withMinH = files.filter((f) => sources.get(f)!.includes('min-h-['));
    expect(withMinH.length).toBeGreaterThan(20);
  });

  it('declares no interactive height below the 48px floor', () => {
    const offenders: string[] = [];
    for (const [file, src] of sources) {
      for (const match of src.matchAll(/min-[hw]-\[(\d+)px\]/g)) {
        if (Number(match[1]) < 48) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(
      offenders,
      "Don Roberto's floor is 48px (CLAUDE.md, UX constraints). A 44px control is the convention " +
        'this issue existed because nothing enforced.'
    ).toEqual([]);
  });
});

describe('accessibility baseline (#101)', () => {
  it('gives keyboard focus a visible ring, once, globally', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline');
    // `focus-visible`, not `focus`: a mouse user tapping a button should not
    // get a ring, which is why `outline-none` was reached for in the first
    // place. The rule has to out-specify those ~60 declarations.
    expect(css).toMatch(/outline:[^;]*!important/);
  });

  it('leaves no <label> that points at nothing', () => {
    const offenders: string[] = [];
    for (const [file, src] of sources) {
      for (const tag of src.match(/<label\b[^>]*>/g) || []) {
        if (tag.includes('htmlFor')) continue;
        // A label that *wraps* its control is already associated.
        const start = src.indexOf(tag);
        const close = src.indexOf('</label>', start);
        const inner = close > start ? src.slice(start + tag.length, close) : '';
        if (/<(input|select|textarea)\b/.test(inner)) continue;
        offenders.push(`${file}: ${tag.slice(0, 60)}`);
      }
    }
    expect(
      offenders,
      'A label needs htmlFor, or it must wrap its control. Screen readers announce bare "edit text", ' +
        'and click-to-focus is broken for everyone.'
    ).toEqual([]);
  });

  it('points every htmlFor at an id that exists in the same file', () => {
    // The sweep that created these mis-paired two checkbox labels before this
    // caught it — a label pointing at the *neighbouring* control is worse than
    // no label, because it confidently says the wrong thing.
    const dangling: string[] = [];
    for (const [file, src] of sources) {
      const ids = new Set([...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      for (const m of src.matchAll(/htmlFor="([^"]+)"/g)) {
        if (!ids.has(m[1])) dangling.push(`${file}: ${m[1]}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('never lets a <label> both wrap its control and point elsewhere', () => {
    const conflicting: string[] = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/<label\b[^>]*htmlFor="([^"]+)"[^>]*>/g)) {
        const close = src.indexOf('</label>', m.index! + m[0].length);
        const inner = src.slice(m.index! + m[0].length, close);
        if (/<(input|select|textarea)\b/.test(inner)) conflicting.push(`${file}: ${m[1]}`);
      }
    }
    expect(conflicting).toEqual([]);
  });

  it('names the search and assistant inputs a placeholder used to stand in for', () => {
    // A placeholder disappears on the first keystroke and is not a label.
    const named = [
      ['app/(dashboard)/quotes/page.tsx', 'Buscar cotizaciones'],
      ['app/(dashboard)/receivables/page.tsx', 'Buscar cobros'],
      ['app/(dashboard)/clients/page.tsx', 'Buscar clientes'],
      ['components/assistant/AIAssistantCard.tsx', 'Escribe tu pregunta al asistente'],
    ] as const;
    for (const [file, label] of named) {
      expect(sources.get(file), `${file} search input needs a name`).toContain(
        `aria-label="${label}"`
      );
    }
  });

  it('keeps the dark palette — no light-theme island in a dark app', () => {
    // `text-gray-400` on `bg-white` measured 2.54:1 inside the help search box.
    const offenders: string[] = [];
    for (const [file, src] of sources) {
      for (const cls of ['bg-white', 'text-gray-900', 'text-gray-400', 'bg-gray-100', 'bg-amber-50']) {
        if (src.includes(`"${cls}`) || src.includes(` ${cls} `) || src.includes(` ${cls}"`)) {
          offenders.push(`${file}: ${cls}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not carry information in slate-500 where it gates an action', () => {
    // The CLABE counter gates the submit button and the upload limit is the
    // only statement of the constraint; both were 3.75:1.
    const gating = [
      ['app/onboarding/page.tsx', 'de 18 dígitos'],
      ['components/settings/BankAccountCard.tsx', 'de 18 dígitos'],
      ['app/pay/[token]/page.tsx', 'Máximo 5MB'],
    ] as const;
    for (const [file, needle] of gating) {
      const line = sources
        .get(file)!
        .split('\n')
        .find((l) => l.includes(needle));
      expect(line, `${file}: "${needle}" not found`).toBeTruthy();
      expect(line, `${file}: "${needle}" carries a rule the user must read`).not.toContain(
        'text-slate-500'
      );
    }
  });

  it('gives credit status a channel other than colour', () => {
    // #96 already gave each state distinct words; this adds the icon, matching
    // ReceivableCard. The badge decides whether to extend credit.
    const src = sources.get('components/clients/ClientCard.tsx')!;
    expect(src).toContain('Crédito bloqueado');
    expect(src).toContain('Crédito suspendido');
    expect(src).toMatch(/<Ban className/);
    expect(src).toMatch(/<AlertTriangle className/);
  });

  it('announces asynchronous errors', () => {
    // Only 4 of 23 error containers had role="alert"; an async failure was
    // silent to a screen reader.
    const unannounced: string[] = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/<div\b((?:[^<>]|\n)*?)>/g)) {
        const tag = m[0];
        if (!/bg-(rose|red)-950/.test(tag)) continue;
        if (tag.includes('role="alert"') || tag.includes('aria-live')) continue;
        const body = src.slice(m.index! + tag.length, m.index! + tag.length + 400);
        if (/\{\s*[a-zA-Z]*[Ee]rror[A-Za-z]*\s*[}|]/.test(body)) unannounced.push(file);
      }
    }
    expect(unannounced).toEqual([]);
  });
});

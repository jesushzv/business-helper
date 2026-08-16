import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `buildCFDIPayload` hardcodes 16% IVA on every item, and nothing may call it.
 *
 * The real issuance path is `app/api/invoices/issue/route.ts`, which builds its
 * concept through `buildMilestoneLineItem` — the builder that derives the tax
 * lines from the originating quote and, since #347, never leaves them implicit.
 * `buildCFDIPayload` predates that and still carries a literal
 * `taxes: [{ type: 'IVA', rate: 0.16 }]` for every line it maps.
 *
 * It keeps its tests because they pin two things learned live against v2 (#26):
 * the concept must be nested under `product`, and `tax_included` defaults to
 * TRUE so it has to be sent explicitly. That knowledge is worth keeping. The
 * function is not worth calling.
 *
 * The trap this closes: the next session that needs "the CFDI payload builder"
 * finds this one by name, calls it, and stamps 16% IVA onto a quote whose owner
 * switched IVA off in the wizard — the exact overcharge #347 is about, arriving
 * through a different door. A caller appearing here is not a style problem; it
 * is that defect.
 *
 * Verified red: a planted `buildCFDIPayload(...)` call in
 * `app/api/invoices/issue/route.ts` fails `nothing outside lib/facturapi.ts
 * calls it`.
 */

const ROOTS = ['app', 'lib', 'components'];
const DEFINITION = join('lib', 'facturapi.ts');
const SYMBOL = 'buildCFDIPayload';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const files = ROOTS.flatMap((root) => sourceFiles(root));

describe('The 16%-hardcoding CFDI payload builder has no caller (#347)', () => {
  it('scanned a plausible number of source files', () => {
    // The scan is worthless if the walk silently matched nothing — the repo has
    // hundreds of .ts/.tsx files under these roots.
    expect(files.length).toBeGreaterThan(100);
  });

  it('is still exported from lib/facturapi.ts, so the scan targets something real', () => {
    const source = readFileSync(DEFINITION, 'utf8');
    expect(source).toContain(`export function ${SYMBOL}`);
  });

  it('nothing outside lib/facturapi.ts calls it', () => {
    const callers = files
      .filter((file) => file !== DEFINITION)
      .filter((file) => new RegExp(`\\b${SYMBOL}\\s*\\(`).test(readFileSync(file, 'utf8')));

    expect(callers).toEqual([]);
  });

  it('the live issuance route builds its concept through buildMilestoneLineItem', () => {
    // The other half of the same fact: the route that does stamp must keep
    // using the quote-derived builder, not acquire a hardcoded tax line.
    const route = readFileSync(join('app', 'api', 'invoices', 'issue', 'route.ts'), 'utf8');

    expect(route).toContain('buildMilestoneLineItem');
    expect(route).not.toMatch(/rate:\s*0\.16/);
  });
});

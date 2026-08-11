import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * #174, held in place.
 *
 * `POST /api/invoices/[id]/cancel` has no UI caller **by design for launch**:
 * a CFDI cancellation needs a motivo (01–04), a replacement UUID for `01`, and
 * an outcome that can be "en proceso" or "rechazada por el receptor" — so a
 * button with a spinner over it would be hard rule #1 applied to a fiscal
 * document. The stamping confirmation tells the tenant plainly that stamping
 * cannot be undone in the app, and that sentence has to stay true.
 *
 * Two ways it could stop being true, both of which this fails on:
 *  - a caller appears in `app/` or `components/` (the decision changed, or was
 *    never read), or
 *  - the note explaining why the route is unreachable disappears from the
 *    route, leaving the next session to read the absence as an oversight.
 *
 * This is an assertion of absence, so it carries a positive control: the same
 * scan must find the sibling `/api/invoices/<id>/complement` call, which proves
 * the scan reads real files and would see a `/cancel` written the same way.
 */

const ROOTS = ['app', 'components', 'lib'] as const;
const APP_API = path.join(process.cwd(), 'app', 'api');
const CANCEL_ROUTE = path.join(process.cwd(), 'app', 'api', 'invoices', '[id]', 'cancel', 'route.ts');

/** Every client-side source file — the route handlers themselves are the server. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir.startsWith(APP_API)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const root of ROOTS) walk(path.join(process.cwd(), root));
  return out;
}

/**
 * References to a per-invoice sub-route, as they are actually written:
 * `/api/invoices/${milestoneId}/complement`, `/api/invoices/abc/cancel`.
 * Returns the sub-route name so the caller can decide which are allowed.
 */
function invoiceSubRouteRefs(): { file: string; sub: string; line: number }[] {
  const refs: { file: string; sub: string; line: number }[] = [];
  const pattern = /\/api\/invoices\/(?:\$\{[^}]*\}|[\w[\]-]+)\/([a-z-]+)/g;

  for (const file of sourceFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text))) {
        refs.push({ file: path.relative(process.cwd(), file), sub: match[1], line: i + 1 });
      }
    });
  }

  return refs;
}

describe('CFDI cancellation has no UI entry point (#174)', () => {
  const refs = invoiceSubRouteRefs();

  it('finds the sibling per-invoice sub-routes, so an absence here means something', () => {
    // Positive control. If this ever goes to zero the scan has stopped reading
    // the files it claims to guard, and the assertion below is vacuous.
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.map((r) => r.sub)).toContain('complement');
  });

  it('has no caller in app/ or components/ or lib/', () => {
    const callers = refs.filter((r) => r.sub === 'cancel');
    expect(
      callers.map((r) => `${r.file}:${r.line}`),
      'A caller for /api/invoices/[id]/cancel appeared. That is a product and fiscal ' +
        'decision (#174), not a wiring task: the UI needs a motivo select, the ' +
        'replacement UUID for motivo 01, and a status that can render "en proceso" and ' +
        '"rechazada por el receptor". Re-open #174 before adding one.'
    ).toEqual([]);
  });

  it('keeps the route note that explains why it is unreachable', () => {
    const source = fs.readFileSync(CANCEL_ROUTE, 'utf8');
    expect(source).toContain('No UI entry point, by design for launch (#174)');
  });
});

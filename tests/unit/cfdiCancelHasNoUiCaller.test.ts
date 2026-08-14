import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #174 — the CFDI cancel route has no UI caller *by decision*.
 *
 * `app/api/invoices/[id]/cancel/route.ts` exists, is tested, and enforces RBAC
 * and org scoping. Nothing calls it, and for launch nothing should: CFDI 4.0
 * cancellation needs a motivo (01–04), `01` needs the replacement UUID, the
 * receptor can refuse anything that is not `04`, and the SAT answers
 * asynchronously. A button with a spinner over that reports an outcome the SAT
 * has not given — hard rule #1 on a fiscal document.
 *
 * The decision is load-bearing for copy that already shipped: the stamping
 * confirmation tells the tenant "Esta acción no se puede deshacer desde la
 * app." That sentence is true exactly as long as this route stays uncalled, so
 * the two are pinned together here. A caller appearing is not a bug — it is a
 * reopened decision, and this test is where it says so.
 *
 * Verified red: a planted `fetch('/api/invoices/x/cancel')` in a component
 * fails `no UI calls it`.
 */

const ROOTS = ['app', 'components'];
const ROUTE = 'app/api/invoices/[id]/cancel/route.ts';
const COMPLEMENT_ROUTE = 'app/api/invoices/[id]/complement/[complementId]/cancel/route.ts';
const STAMP_COPY = 'no se puede deshacer desde la app';

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

describe('CFDI cancellation has no UI caller, by decision (#174)', () => {
  it('scanned a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('still ships the route — the decision is "no UI", not "no capability"', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain('export async function POST');
    // The decision is recorded where someone about to wire it will look.
    expect(src).toContain('#174');
  });

  it('covers the complement cancel route the same way (#30)', () => {
    // #30 shipped `[complementId]/cancel`, which is the same class of action on
    // the same kind of document: a motivo, a receptor who can refuse, an async
    // SAT answer. The `no UI calls it` case below already matches its path —
    // this pins that the route exists and carries the decision, so the match is
    // deliberate rather than incidental.
    const src = readFileSync(COMPLEMENT_ROUTE, 'utf8');
    expect(src).toContain('export async function POST');
    expect(src).toContain('#174');
    expect(src).toContain('#30');
  });

  it('no UI calls it', () => {
    const callers = files.filter((f) => /invoices\/[^'"`]*\/cancel|invoices\/.*cancel/.test(readFileSync(f, 'utf8')));
    expect(
      callers,
      'Wiring CFDI cancellation reopens #174: it needs a motivo, the 01 replacement UUID, ' +
        'receptor refusal and an async SAT answer — and it invalidates the stamping dialog copy.'
    ).toEqual([]);
  });

  it('keeps the stamping confirmation honest about there being no undo', () => {
    // The other half of the same fact. If cancellation ever ships, this copy
    // has to change in the same PR — and this assertion is what says so.
    const invoiceCard = readFileSync('components/invoices/InvoiceManagerCard.tsx', 'utf8');
    expect(invoiceCard).toContain(STAMP_COPY);
  });
});

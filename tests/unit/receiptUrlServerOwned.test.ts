import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MILESTONE_WRITABLE_FIELDS } from '@/lib/apiAuth';

/**
 * `receipt_url` is written by the server, from the URL storage issued, and by
 * nothing else (#355).
 *
 * It used to sit in `MILESTONE_WRITABLE_FIELDS`, so `PUT /api/receivables/[id]`
 * applied whatever string arrived — no format check, no existence check, no
 * capability gate; only `status === 'confirmed'` was gated. Any authenticated
 * member, including `member` and `accountant` (neither of which holds
 * `confirm_payment`), could point a cobro's payment evidence at
 * `blob:http://x/y` — re-creating the exact dead link `SpeiConfirmModal` still
 * carries a guard against (#85) — or at an arbitrary external URL, which then
 * rode into the accountant's export as `Comprobante_SPEI_.jpg`.
 *
 * The public twin had solved this already (`isValidReceiptPath` constrains the
 * shape, then the route lists the object to prove it exists — "shape is not
 * existence", in its own words). None of it had crossed to the authenticated
 * side, because until #339 nothing on the tenant side wrote the column at all.
 *
 * Rather than port the validation, the field left the client's hands: the
 * upload route writes the row itself. That makes "only a server-issued URL can
 * land" **structural** — there is no client-supplied string to validate — and
 * it closes the orphaned-object window the old two-step left between storing
 * the file and pointing the row at it.
 */

const API_ROOT = join(process.cwd(), 'app', 'api');
const CLIENT_ROOTS = ['components', 'app', 'lib/hooks'].map((d) => join(process.cwd(), d));

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path, match));
    else if (match(entry.name)) out.push(path);
  }
  return out;
}

describe('receipt_url is not a client-writable field (#355)', () => {
  it('is absent from MILESTONE_WRITABLE_FIELDS', () => {
    // Read from the source rather than restated here: a hand-maintained copy
    // of the list could not catch the list changing.
    expect(MILESTONE_WRITABLE_FIELDS).not.toContain('receipt_url');
    // And the list is still the real one, not an empty import.
    expect(MILESTONE_WRITABLE_FIELDS).toContain('tracking_reference');
    expect(MILESTONE_WRITABLE_FIELDS.length).toBeGreaterThan(3);
  });

  it('no client sends receipt_url in a request body', () => {
    // The hook's two-step PUT is what made the field load-bearing on the
    // tenant side; it is gone. Anything that reintroduces a client-supplied
    // receipt_url reintroduces the hole, because the server has no validation
    // to fall back on — by design.
    const offenders: string[] = [];
    let scanned = 0;

    for (const root of CLIENT_ROOTS) {
      for (const file of filesUnder(root, (n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
        // Route handlers are servers, not clients.
        if (file.includes(`${join('app', 'api')}`)) continue;
        scanned += 1;
        const source = readFileSync(file, 'utf8');
        // A JSON body naming the column: `JSON.stringify({ receipt_url: … })`
        // or a `body:` object literal carrying it.
        if (/JSON\.stringify\(\s*\{[^}]*receipt_url/s.test(source)) {
          offenders.push(file.replace(process.cwd() + '/', ''));
        }
      }
    }

    // A scan that matched nothing because it walked nothing is not a pass.
    expect(scanned).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it('the upload route is the writer, and it writes what storage returned', () => {
    const source = readFileSync(
      join(API_ROOT, 'receivables', '[id]', 'upload', 'route.ts'),
      'utf8'
    );

    expect(source).toContain('.update({ receipt_url: publicUrlData.publicUrl })');
    // Scoped to the caller's organization like every other write (convention 3).
    expect(source).toContain(".eq('organization_id', organizationId)");
    // And gated, which the PUT it replaced was not.
    expect(source).toContain("hasCapability(role, 'confirm_payment')");
  });

  it('the only other writer mints its own URL too, wherever the write now lives', () => {
    // Stated so the set is closed rather than assumed. It used to be two route
    // files; the public payer route's declaration write moved into
    // `record_milestone_payment` behind `lib/milestonePayments.ts` (#381), so
    // the scan covers `lib/` as well. Narrowing it back to `app/api` would have
    // let the set look closed while a writer sat outside the walk — the shape
    // of an absence assertion that quietly matches nothing (rule 7).
    const strip = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const candidates = [
      ...filesUnder(API_ROOT, (n) => n === 'route.ts'),
      ...filesUnder(join(process.cwd(), 'lib'), (n) => n.endsWith('.ts')),
    ];
    // A walk that found almost nothing would make the assertion vacuous.
    expect(candidates.length).toBeGreaterThan(50);

    // `receipt_url:` in a module that never writes is a *mapping* — the
    // accountant export and the receivables hook both read the column into a
    // row shape. A writer is a file that names the column and issues a write,
    // which is the property this test is about.
    const WRITES = /\.(insert|update|upsert|rpc)\(|p_receipt_url/;
    const writers = candidates.filter((file) => {
      const source = strip(readFileSync(file, 'utf8'));
      return /receipt_url\s*[:=]/.test(source) && WRITES.test(source);
    });

    expect(writers.map((f) => f.replace(process.cwd() + '/', '')).sort()).toEqual([
      'app/api/receivables/[id]/upload/route.ts',
      'lib/milestonePayments.ts',
    ]);
  });
});

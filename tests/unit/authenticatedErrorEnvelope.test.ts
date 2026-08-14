import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #275 — every API error body uses the envelope, in Spanish.
 *
 * API convention #2 is `{ error: { code, message } }` with a Spanish message.
 * `tests/unit/publicErrorEnvelope.test.ts` gates only `public/*` routes, so
 * the authenticated ones drifted: the receivables routes answered
 * `{ error: 'Failed to fetch receivables' }` — a bare English string the
 * dashboard rendered to the tenant verbatim. This scan closes the gap for the
 * whole `app/api` tree: a bare string literal assigned to the `error` key
 * fails the build.
 *
 * The set is derived from the tree, not hand-maintained (hard rule #7).
 */

const API_ROOT = join(process.cwd(), 'app', 'api');

/**
 * Known bare-string offenders that predate this gate, each carrying the issue
 * that owns its cleanup. An entry that stops matching must be removed — the
 * positive-control test below fails otherwise, so the list is self-cleaning.
 */
const GRANDFATHERED: Record<string, string> = {
  // Empty, and meant to stay that way. The Stripe webhook route was the last
  // entry; #325 converted its ten bodies. The self-cleaning check below is
  // what forced the removal to happen in the same PR as the conversion.
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === 'route.ts') out.push(path);
  }
  return out;
}

const files = routeFiles(API_ROOT);
// The lookbehind excludes column assignments like `cfdi_error: '…'`, which are
// data, not response envelopes.
const BARE_STRING_ERROR = /(?<![\w$])error:\s*['"`]/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('authenticated API error envelope (#275)', () => {
  it('scanned a plausible number of route files', () => {
    expect(files.length).toBeGreaterThan(25);
  });

  it('no route answers a bare string under the error key', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(process.cwd().length + 1).replaceAll('\\', '/');
      if (rel in GRANDFATHERED) continue;
      if (BARE_STRING_ERROR.test(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      'Use { error: { code, message } } with a Spanish message (API convention #2, #275)'
    ).toEqual([]);
  });

  it('every grandfathered entry still contains the pattern (self-cleaning list)', () => {
    for (const rel of Object.keys(GRANDFATHERED)) {
      const src = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
      expect(BARE_STRING_ERROR.test(src), `${rel} is clean now — remove it from GRANDFATHERED`).toBe(
        true
      );
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The coverage gate is stated once, in `vitest.config.ts` (#51).
 *
 * It was declared there and executed nowhere: `npm test` is
 * `lint && typecheck && vitest run` with no `--coverage`, CI ran
 * `npx vitest run`, and `test:coverage` was invoked by no automation. Run by
 * hand it was red. Meanwhile **eight documents** cited "the 85% coverage gate"
 * — one of them with a ticked checkbox — as evidence the code was covered.
 *
 * That is the same shape as the simulated-CFDI finding and the lint-gate one:
 * a document asserting a check that no longer corresponds to anything running.
 * Six documents describing a gate that does not exist is worse than having no
 * gate, because they get quoted as proof.
 *
 * Two halves close it, and this test is the second:
 *
 *   1. CI runs `npx vitest run --coverage`, so the thresholds are real.
 *   2. No markdown may restate the numbers. `docs/STATUS.md` carries the
 *      *measured* figures, per its own doc contract; `vitest.config.ts` carries
 *      the *enforced* ones. Everything else points at them.
 *
 * The forbidden shape is a percentage next to a coverage word. It is derived
 * from the tree, not from the list of documents that happened to be wrong in
 * August — the issue named six and there were eight, including `CLAUDE.md` and
 * `MASTER_PROMPT.md`, which its enumeration missed.
 */

const ROOT = join(__dirname, '..', '..');

/** `docs/STATUS.md` owns measured figures; the config owns enforced ones. */
const ALLOWED = new Set(['docs/STATUS.md']);

/** Superseded dashboards are read-only history and are never updated. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'coverage', '99-archive']);

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return entry.endsWith('.md') ? [full] : [];
  });
}

/**
 * A coverage percentage: a number with a `%` within a short distance of a
 * coverage word, so "85% iPhone / 15% Desktop" and "85% Month-3 Retention"
 * — both real, both unrelated — do not trip it.
 */
const COVERAGE_CLAIM = /(?:cover(?:age|ed)|statements?|branches)[^.\n]{0,60}?\b\d{2}(?:\.\d+)?\s*%|\b\d{2}(?:\.\d+)?\s*%[^.\n]{0,30}?(?:cover(?:age|ed))/i;

describe('the coverage gate has one source of truth (#51)', () => {
  it('vitest.config.ts declares thresholds and CI runs them', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    expect(config).toMatch(/thresholds:\s*\{/);

    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(
      ci,
      'CI must run vitest with --coverage, or the thresholds are decorative again (#51).'
    ).toMatch(/vitest run --coverage/);
  });

  it('the thresholds are a ratchet, never above what the suite achieves', () => {
    // Set above the measured figure and every pull request is red for reasons
    // unrelated to its diff, which is how the previous numbers came to be
    // ignored. This pins the shape, not the values: they are meant to rise.
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    const block = config.slice(config.indexOf('thresholds:'));

    for (const key of ['lines', 'functions', 'branches', 'statements']) {
      const match = new RegExp(`${key}:\\s*(\\d+(?:\\.\\d+)?)`).exec(block);
      expect(match, `vitest.config.ts declares no ${key} threshold`).not.toBeNull();
      const value = Number(match![1]);
      expect(value, `${key} threshold is not a real gate`).toBeGreaterThan(50);
      expect(value, `${key} threshold exceeds 100`).toBeLessThanOrEqual(100);
    }
  });

  it('no document restates a coverage figure', () => {
    const files = markdownFiles(ROOT);
    // A walk that found almost nothing would make this vacuous.
    expect(files.length).toBeGreaterThanOrEqual(15);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (ALLOWED.has(rel)) continue;

      for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (COVERAGE_CLAIM.test(line)) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
      }
    }

    expect(
      offenders,
      `These documents restate a coverage number:\n${offenders.join('\n')}\n\n` +
        'The enforced thresholds live in vitest.config.ts and the measured figures in ' +
        'docs/STATUS.md. A number in two places drifts, and the stale copy gets quoted as ' +
        'evidence the code is covered — which is exactly what #51 found.'
    ).toEqual([]);
  });
});

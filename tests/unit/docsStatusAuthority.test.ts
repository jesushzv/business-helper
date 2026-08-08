import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Docs drift is this repo's most expensive recurring defect.
 *
 * The roadmap once reported 100% progress while CFDI stamping, Stripe checkout, team invites and
 * the accountant export were all simulated. The launch checklist recorded a merged PR as unmerged,
 * two pending migrations when there were three, and "coverage exceeds 85%" on the strength of a
 * threshold CI does not run. The P0 stack went stale within hours of being written, twice.
 *
 * Every one of those was a convention nobody executed. `docs/STATUS.md` is now the single document
 * allowed to assert status; this suite is what makes that a gate rather than a wish.
 *
 * Two rules:
 *   1. A doc that talks about status must point at the authority.
 *   2. Volatile numbers — test counts, coverage, % complete — live in the authority only.
 */

const ROOT = join(__dirname, '..', '..');
const AUTHORITY = join('docs', 'STATUS.md');
const MARKER = '<!-- STATUS-AUTHORITY: docs/STATUS.md -->';

/** Reference material that describes mechanism, not state. Templates are fill-in forms; the
 *  archive is deliberately frozen and carries its own banner; security-p0-remediation is a
 *  historical incident record whose "P0-1..P0-4" are finding IDs, not live priorities. */
const EXEMPT_PREFIXES = [
  join('docs', '05-templates'),
  join('docs', '99-archive'),
];
const EXEMPT_FILES = [join('docs', 'security-p0-remediation.md')];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.md') ? [full] : [];
  });
}

const docs = walk(join(ROOT, 'docs'))
  .map((f) => relative(ROOT, f))
  .filter((f) => f !== AUTHORITY)
  .filter((f) => !EXEMPT_FILES.includes(f))
  .filter((f) => !EXEMPT_PREFIXES.some((p) => f.startsWith(p + sep)))
  .sort();

function read(f: string): string {
  return readFileSync(join(ROOT, f), 'utf-8');
}

/**
 * Markers that assert *state*.
 *
 * Deliberately excludes the bare word "complete": it matches a `'completed'` enum value, "the
 * complete Quote → Pay loop", and "a complete blueprint" — prose, not claims. Only the status
 * forms (`Status: Completed`, a ☑ cell) count. A signal with a high false-positive rate trains
 * people to add the marker without thinking, which defeats it.
 */
const STATUS_SIGNALS: Array<{ label: string; re: RegExp }> = [
  { label: 'completion checkbox', re: /^\s*[-*]\s*\[[ xX]\]/m },
  { label: 'status emoji', re: /[✅🟢🔴🟡☑]/u },
  { label: 'priority label (P0/P1/P2)', re: /\bP[012]\b/ },
  { label: 'status-form "Completed"', re: /(?:\*\*)?Status(?:\*\*)?\W{0,4}`?\**Complete/i },
];

/**
 * Numbers that are wrong the moment code changes. Every one of these has already been wrong
 * here: 182, 383 and 494 test counts, "100% roadmap progress", "coverage exceeds 85%".
 *
 * Note what is NOT forbidden: stating the *threshold* ("the gate is >= 85%") is policy and
 * belongs in the architecture and playbook docs. Only claiming the *achieved* number is banned.
 */
const VOLATILE_NUMBERS: Array<{ label: string; re: RegExp }> = [
  { label: 'test count ("N tests / M files")', re: /\d+\s*(?:unit\/component\s+|unit\/integration\s+)?tests?\s*\/\s*\d+\s*files?/i },
  { label: 'coverage achievement claim', re: /coverage\s+(?:exceeds|is|was|reached|sits at|currently)\s+\**\d{1,3}\s*%/i },
  { label: 'percent complete', re: /\d{1,3}\s*%\s*(?:roadmap\s*)?(?:complete|progress)/i },
];

describe('docs/STATUS.md is the status authority', () => {
  it('exists and declares itself', () => {
    const authority = read(AUTHORITY);
    expect(authority).toContain(MARKER);
    expect(authority).toMatch(/This file owns status/);
  });

  it('finds documents to check (guards against a broken walk silently passing)', () => {
    expect(docs.length).toBeGreaterThan(10);
  });
});

describe('rule 1 — a doc that asserts status must point at the authority', () => {
  it.each(docs)('%s', (doc) => {
    const body = read(doc);
    const hits = STATUS_SIGNALS.filter((s) => s.re.test(body)).map((s) => s.label);

    if (hits.length === 0) return; // pure reference doc, nothing to declare

    expect(
      body.includes(MARKER),
      `${doc} asserts status (${hits.join(', ')}) but does not carry the authority marker.\n` +
        `Either remove the status claims — they belong in ${AUTHORITY} — or add this line near the top:\n` +
        `  ${MARKER}\n` +
        `and a sentence pointing the reader at ${AUTHORITY} for live status.`
    ).toBe(true);
  });
});

describe('rule 2 — volatile numbers live only in the authority', () => {
  it.each(docs)('%s', (doc) => {
    const body = read(doc);
    const offenders = VOLATILE_NUMBERS.filter((v) => v.re.test(body));

    expect(
      offenders.map((o) => o.label),
      `${doc} states a number that goes stale the moment code changes.\n` +
        `Test counts, coverage percentages and "% complete" belong in ${AUTHORITY} only — ` +
        `every one of these has been wrong in this repo before (182, 383, 494, "100% progress", ` +
        `"exceeds 85%"). Link to ${AUTHORITY} instead of restating the number.`
    ).toEqual([]);
  });
});

/**
 * Rule 3 — the P0 table's own internal consistency.
 *
 * The table states an invariant ("every row maps to exactly one open issue and
 * every open P0 issue appears below") that no test can fully check offline: the
 * open/closed half needs the tracker. What *is* checkable is the half that has
 * actually drifted — #76 was merged and its row never added, and the rows have
 * now been renumbered twice by hand (#79 inserted at 6, #76 at 2), each time
 * with prose elsewhere referring to rows by number.
 *
 * So this pins the mechanical part: rows numbered 1..N with no gaps, no
 * duplicates, exactly one issue link each, and no two rows tracking the same
 * issue. It cannot tell you a row is missing — only that the ones present are
 * coherent. Stated plainly so nobody reads a green run as "the invariant holds".
 */
describe('rule 3 — the P0 table is internally coherent', () => {
  const ROW = /^\| (\d+) \| .*?\| \[#(\d+)\]\(https:\/\/github\.com\/[^)]+\/issues\/(\d+)\) \|\s*$/;

  const rows = read(AUTHORITY)
    .split('\n')
    .map((line) => line.match(ROW))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ n: Number(m[1]), label: Number(m[2]), href: Number(m[3]) }));

  it('has rows to check at all', () => {
    // Guards against the regex silently matching nothing after a format change,
    // which would make every assertion below vacuously true.
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it('numbers rows 1..N with no gaps or duplicates', () => {
    expect(rows.map((r) => r.n)).toEqual(rows.map((_, i) => i + 1));
  });

  it('links each row to exactly one issue, with the label matching the href', () => {
    const mismatched = rows.filter((r) => r.label !== r.href);
    expect(mismatched.map((r) => `row ${r.n}: #${r.label} → issues/${r.href}`)).toEqual([]);
  });

  it('tracks no issue in two different rows', () => {
    const seen = new Map<number, number>();
    const dupes: string[] = [];
    for (const r of rows) {
      const prev = seen.get(r.href);
      if (prev !== undefined) dupes.push(`#${r.href} in rows ${prev} and ${r.n}`);
      else seen.set(r.href, r.n);
    }
    expect(dupes).toEqual([]);
  });
});

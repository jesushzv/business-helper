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
/** The other always-read document: CLAUDE.md's defect-class catalogue, split out in #135.
 *  Its content is guarded by tests/unit/lessonsCatalogue.test.ts; its size, here. */
const LESSONS = join('docs', 'LESSONS.md');
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
 * Rule 3 — the authority stays small enough that reading it is cheap.
 *
 * `docs/STATUS.md` reached 47 KB (~13,000 tokens) by 2026-08-08, 59% of it a chronological
 * append-only log: nine dated "Update ... drafted, pending merge" entries, every one of which had
 * merged by the time anyone read them. Size was not the real cost — drift was. A document nobody
 * can hold in their head stops being checked, and the anti-drift document had itself drifted.
 *
 * Cleaning it up once fixes nothing: the behaviour that grew it is the same behaviour the process
 * asks for ("update the memo when you finish work"). This budget is what makes the archive step
 * non-optional. When it trips, the fix is to move settled history to `docs/99-archive/`, not to
 * raise the number.
 */
const SIZE_BUDGETS: Array<{ file: string; maxBytes: number; guidance: string }> = [
  {
    file: AUTHORITY,
    maxBytes: 32_000,
    guidance:
      'Move settled history — anything describing work that has merged — into docs/99-archive/ ' +
      '(see status-log-2026-08.md for the pattern: move entries verbatim, leave a table of what ' +
      'landed with the commit for each). Keep this file describing the CURRENT state only.',
  },
  {
    file: 'CLAUDE.md',
    maxBytes: 18_000,
    guidance:
      'This file loads at the start of every session, so every byte is paid on every task. It holds ' +
      'RULES; the defect-class catalogue it used to carry now lives in docs/LESSONS.md (#135) — a ' +
      'new lesson belongs there, and this budget is deliberately too tight to take it back. If a ' +
      'CONVENTION genuinely changed, pay for it by pruning: a rule backed by a SCANNING gate (one ' +
      'that fails on the next occurrence anywhere in the tree, e.g. url.test.ts, ' +
      'securityDefinerGrants.test.ts, this file) needs only to state the rule and name the test — ' +
      'the test does the convincing.',
  },
  {
    file: LESSONS,
    maxBytes: 16_000,
    guidance:
      'The defect-class catalogue. It is meant to grow — that is why it has headroom — but not ' +
      'without bound. When this trips: retire lessons a scanning gate now covers (state the rule, ' +
      'name the test, delete the narrative, and follow lessonsCatalogue.test.ts\'s RETIRED ' +
      'protocol), or move settled history to docs/99-archive/. A lesson with only a regression ' +
      'test, or none, keeps its full narrative — there the prose is the only thing standing ' +
      'between an agent and the defect.',
  },
];

/**
 * The combined ceiling, stated once so the split cannot quietly become a doubling.
 *
 * This was a single 26,000-byte budget on CLAUDE.md. Splitting the catalogue out (#135) is not a
 * licence to spend twice as much: the two files together get 32 KB (~8,900 tokens), an explicit
 * ~6 KB rise bought for one reason — a document at 99.9% of its budget forces every session that
 * adds a line to compress unrelated prose, which is how three concurrent PRs came to conflict on
 * paragraphs none of them meant to change. Headroom is the fix; this is the bound on it.
 */
const COMBINED_BUDGET_BYTES = 32_000;

describe('rule 3 — the always-read documents stay within budget', () => {
  it.each(SIZE_BUDGETS)('$file is under $maxBytes bytes', ({ file, maxBytes, guidance }) => {
    const bytes = Buffer.byteLength(read(file), 'utf-8');

    expect(
      bytes,
      `${file} is ${bytes} bytes, over its ${maxBytes}-byte budget (~${Math.round(bytes / 3.6)} tokens, ` +
        `paid on every session that reads it).\n\n${guidance}\n\n` +
        `Raising this number is the wrong fix unless you can say what new content earns permanent residence.`
    ).toBeLessThanOrEqual(maxBytes);
  });

  it(`CLAUDE.md + ${LESSONS} together are under ${COMBINED_BUDGET_BYTES} bytes`, () => {
    const files = ['CLAUDE.md', LESSONS];
    const total = files.reduce((sum, f) => sum + Buffer.byteLength(read(f), 'utf-8'), 0);

    expect(
      total,
      `The always-read set is ${total} bytes (${files
        .map((f) => `${f} ${Buffer.byteLength(read(f), 'utf-8')}`)
        .join(', ')}), over the ${COMBINED_BUDGET_BYTES}-byte combined budget.\n\n` +
        `Both files are loaded on every task, so this total — not either file alone — is what each ` +
        `session pays. Prune before you raise it.`
    ).toBeLessThanOrEqual(COMBINED_BUDGET_BYTES);
  });
});

/**
 * Rule 4 — the authority states current state, not a changelog.
 *
 * The specific shape that grew this file was a dated `### Update <date>` heading appended per PR.
 * Each was accurate when written and wrong within days, because nothing ever went back to mark them
 * merged. Prose like "*Updated 2026-08-07 — three rows cleared*" inside a section is fine; it edits
 * the current state. A dated heading is not — it starts a log.
 */
const UPDATE_LOG_HEADING = /^#{2,4}\s+Update\s+\d{4}-\d{2}-\d{2}/gm;

describe('rule 4 — the authority is not an append-only log', () => {
  it('has no dated "Update <date>" headings', () => {
    const body = read(AUTHORITY);
    const found = [...body.matchAll(UPDATE_LOG_HEADING)].map((m) => m[0].trim());

    expect(
      found,
      `${AUTHORITY} has dated update headings, which is how it reached 47 KB before:\n` +
        found.map((f) => `  ${f}`).join('\n') +
        `\n\nA dated heading starts a changelog. Fold what is still true into the current-state ` +
        `sections, and put the narrative in docs/99-archive/ where it is frozen and exempt from ` +
        `this suite. Undated prose noting when something changed is fine.`
    ).toEqual([]);
  });
});

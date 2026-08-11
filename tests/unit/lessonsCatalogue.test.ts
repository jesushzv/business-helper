import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `docs/LESSONS.md` is the catalogue of defect classes this repo has actually shipped. It is read
 * at the start of every session, and it is the only thing standing between an agent and a defect
 * that has already cost real money here at least eight times.
 *
 * It is also the file most likely to be lost in a merge.
 *
 * The mechanism, from #135: every session that learns something appends to this catalogue, so
 * concurrent PRs collide on it constantly. The only tractable way to resolve a twelve-hunk prose
 * conflict is to take one side wholesale — `git checkout --theirs` — and re-apply the other by
 * hand. A session resolving someone *else's* conflict has no list of what the other branch added,
 * so the re-apply silently doesn't happen. Nothing catches it: the size budget passes, the doc
 * contract passes, CI is green. A green signal over a loss nobody sees is the same defect class as
 * everything under "Fabricated success" in the file this test guards.
 *
 * So the inventory lives here, in code, where a prose conflict cannot reach it: every issue number
 * cited by a lesson, committed. Drop a lesson in a resolution and the build goes red naming the
 * numbers that vanished.
 *
 * Adding a lesson? Add its issue number to LESSON_REFS in the same commit.
 * Retiring one — because a scanning gate now covers it, or it stopped being true — is deliberate,
 * not accidental: delete it from LESSON_REFS and record why in RETIRED.
 */

const ROOT = join(__dirname, '..', '..');
const CATALOGUE = 'docs/LESSONS.md';
const AUTHORITY = 'CLAUDE.md';

/**
 * Every issue number cited by a lesson in docs/LESSONS.md, derived from the file itself and
 * committed. Not hand-curated prose: it must equal what the file contains, in both directions.
 */
const LESSON_REFS: number[] = [
  33, 38, 44, 48, 50, 58, 59, 63, 64, 76, 78, 82, 86, 87, 93, 95, 96, 100, 116, 118, 129, 133,
  135, 146,
];

/**
 * Lessons deliberately removed, with the reason. An entry here asserts the number is gone on
 * purpose — the test holds it to that by failing if the issue reappears in the catalogue while
 * still listed as retired.
 */
const RETIRED: Record<number, string> = {
  // 82: 'next/image migration completed in #NNN — the lint gate now fails on a bare <img>',
};

const body = readFileSync(join(ROOT, CATALOGUE), 'utf-8');
/** The catalogue proper: everything from the first section heading on. The preamble above it
 *  explains the contract and cites #135; counting it would make the manifest depend on prose. */
const catalogue = body.slice(body.indexOf('\n## '));

const sections = [...catalogue.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const lessons = [...catalogue.matchAll(/^- (.+)$/gm)].map((m) => m[1]);

/** `hard rule #1` is a cross-reference to CLAUDE.md's numbered rules, not an issue. */
const refs = [...new Set([...catalogue.replace(/hard rule #\d+/gi, '').matchAll(/#(\d+)/g)].map((m) => Number(m[1])))].sort(
  (a, b) => a - b
);

describe('docs/LESSONS.md parses (a broken parse must not pass silently)', () => {
  it('finds the catalogue sections, lessons and issue references', () => {
    // Plausibility, not exactness: if any of these collapses, the assertions below are vacuous
    // and would happily approve an empty file.
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(lessons.length).toBeGreaterThanOrEqual(20);
    expect(refs.length).toBeGreaterThanOrEqual(15);
  });

  it('reads issue numbers, not rule numbers', () => {
    // Every issue cited here is >= 32; a single digit means a `rule #N` cross-reference leaked
    // into the manifest and would pin the wrong thing.
    expect(refs.filter((r) => r < 10)).toEqual([]);
  });
});

describe('no lesson disappears without saying so', () => {
  it('every committed lesson reference is still in the catalogue', () => {
    const missing = LESSON_REFS.filter((r) => !refs.includes(r));

    expect(
      missing,
      `${CATALOGUE} no longer mentions issue(s) ${missing.join(', ')}, which LESSON_REFS says it ` +
        `should.\n\nIf you are resolving a merge conflict: this is the failure mode this test exists ` +
        `for (#135). Taking one side of a conflict wholesale drops the other side's lessons, and ` +
        `nothing else catches it. Recover the missing lesson from the other branch ` +
        `(\`git log -p --all -- ${CATALOGUE}\`) and re-apply it.\n\n` +
        `If you removed it on purpose: delete it from LESSON_REFS and add it to RETIRED with the ` +
        `reason — a scanning gate that now covers it, or a rule that stopped being true.`
    ).toEqual([]);
  });

  it('every lesson in the catalogue is committed to LESSON_REFS', () => {
    const untracked = refs.filter((r) => !LESSON_REFS.includes(r));

    expect(
      untracked,
      `${CATALOGUE} cites issue(s) ${untracked.join(', ')} that LESSON_REFS does not list, so ` +
        `the next merge could drop them silently.\n\nAdd them to LESSON_REFS in this commit — ` +
        `that array is what makes a lost lesson a red build instead of an invisible regression.`
    ).toEqual([]);
  });

  it('retired lessons stay retired, with a reason', () => {
    const resurrected = Object.keys(RETIRED)
      .map(Number)
      .filter((r) => refs.includes(r) || LESSON_REFS.includes(r));

    expect(
      resurrected,
      `Issue(s) ${resurrected.join(', ')} are listed in RETIRED but appear in the catalogue again. ` +
        `Remove the RETIRED entry if the lesson is back for good.`
    ).toEqual([]);

    Object.entries(RETIRED).forEach(([issue, reason]) => {
      expect(reason.length, `RETIRED[${issue}] needs a reason, not an empty string.`).toBeGreaterThan(20);
    });
  });

  /**
   * The reference inventory misses a lesson that cites no issue (a few predate the tracker
   * convention). A floor on the bullet count catches those. Raise it when you add lessons; it may
   * only go down alongside a RETIRED entry.
   */
  it('the catalogue does not shrink', () => {
    const MIN_LESSONS = 22;

    expect(
      lessons.length,
      `${CATALOGUE} has ${lessons.length} lessons, below the floor of ${MIN_LESSONS}. ` +
        `Some lessons cite no issue number, so LESSON_REFS alone cannot see them go missing. ` +
        `If a lesson was dropped in a merge, recover it; if it was retired on purpose, lower this ` +
        `floor and record the reason in RETIRED.`
    ).toBeGreaterThanOrEqual(MIN_LESSONS);
  });
});

describe('the split only works while CLAUDE.md points here', () => {
  const authority = readFileSync(join(ROOT, AUTHORITY), 'utf-8');

  it('CLAUDE.md imports the catalogue and tells the reader to open it', () => {
    // A compression pass on CLAUDE.md that deletes these two lines silently removes the entire
    // defect-class catalogue from every session's context — the exact loss this split created the
    // possibility of.
    expect(
      authority,
      `${AUTHORITY} must keep the \`@${CATALOGUE}\` import line — it is how the catalogue reaches ` +
        `a session at all.`
    ).toContain(`@${CATALOGUE}`);

    expect(
      authority.includes(`[\`${CATALOGUE}\`](${CATALOGUE})`),
      `${AUTHORITY} must keep the prose pointer to ${CATALOGUE} as well: not every harness expands ` +
        `\`@\` imports, and a reader who does not know the file exists will not open it.`
    ).toBe(true);
  });
});

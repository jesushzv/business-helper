import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `@[…]` context injection in `MASTER_PROMPT.md` resolves (#318).
 *
 * The injections fail **silently**. An agent told to read
 * `@[docs/04-execution-testing/product_readiness_workback.md]` and handed nothing
 * does not get an error — it proceeds with the context it was promised absent,
 * and the only symptom is work done without the constraints that file carried.
 * Seven of them 404'd, five of those pointing at a document that had moved to
 * `docs/99-archive/` and one at a filename whose hyphens should have been
 * underscores.
 *
 * That is the same class as the four-times-shipped hardcoded origin: a
 * reference that used to be right, silently wrong after a move, with nothing
 * checking. So it gets the same treatment — a scan, derived from the file
 * rather than from a list of known-bad paths, with the count asserted so a
 * regex that stops matching cannot pass as a green run.
 *
 * Shown to fail before committing: reverting one reference to the archived
 * workback path turned this red.
 */

const ROOT = join(__dirname, '..', '..');
const MASTER_PROMPT = join(ROOT, 'MASTER_PROMPT.md');

/** Every `@[path]` reference in the template, in order, with duplicates kept. */
function injectionRefs(): string[] {
  const source = readFileSync(MASTER_PROMPT, 'utf8');
  return [...source.matchAll(/@\[([^\]]+)\]/g)].map((match) => match[1]);
}

describe('MASTER_PROMPT.md context injections (#318)', () => {
  it('parses a plausible number of references', () => {
    // A scan that matched nothing is indistinguishable from a scan that
    // passed. The template's whole design is context injection, so a handful
    // of refs would mean the regex broke, not that the template shrank.
    const refs = injectionRefs();
    expect(
      refs.length,
      'Found almost no @[…] injections — the pattern stopped matching, so the ' +
        'assertions below are checking nothing.'
    ).toBeGreaterThanOrEqual(15);
  });

  it('every referenced file exists', () => {
    const missing = injectionRefs()
      .filter((ref, index, all) => all.indexOf(ref) === index)
      .filter((ref) => !existsSync(join(ROOT, ref)));

    expect(
      missing,
      `MASTER_PROMPT.md injects files that do not exist: ${missing.join(', ')}. ` +
        'The injection fails silently, so an agent following that mode runs without ' +
        'the context the template promised it (#318).'
    ).toEqual([]);
  });

  it('references nothing in the read-only archive as an instruction', () => {
    // `docs/99-archive/` is history. Injecting it hands an agent a superseded
    // plan with the same authority as a live one — which is how a template
    // step came to instruct writing ☑ status marks into an archived file.
    const archived = injectionRefs().filter((ref) => ref.includes('99-archive'));

    expect(
      archived,
      `MASTER_PROMPT.md injects archived documents: ${archived.join(', ')}. ` +
        'Archived docs are readable as history, never injected as instructions (#318).'
    ).toEqual([]);
  });

  it('never instructs an agent to write status outside docs/STATUS.md', () => {
    const source = readFileSync(MASTER_PROMPT, 'utf8');

    // The specific defect: "Mark workstream tasks completed in <archived file>
    // with ☑". Match the shape — a completion mark written into a named file —
    // rather than that one sentence.
    const statusWrites = source
      .split('\n')
      .filter((line) => /mark\b/i.test(line) && /(?:☑|\[x\])/i.test(line))
      .filter((line) => !/STATUS\.md/.test(line))
      .filter((line) => !/product-roadmap\.md/.test(line));

    expect(
      statusWrites,
      `MASTER_PROMPT.md tells an agent to record completion somewhere other than ` +
        `docs/STATUS.md:\n${statusWrites.join('\n')}\n` +
        'Status lives in docs/STATUS.md alone — the rule docsStatusAuthority.test.ts enforces.'
    ).toEqual([]);
  });
});

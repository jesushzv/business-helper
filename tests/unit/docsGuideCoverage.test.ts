import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `AGENTS-DOCS-GUIDE.md` names every document under `docs/` (#319).
 *
 * The guide is the doc index — CLAUDE.md's router points at it, so a file it
 * does not list is a file agents do not find. Its tree block had drifted:
 * `live-verification-recipes.md` and `status-log-2026-08.md` both existed and
 * neither appeared, so the recipes for checking production from a session were
 * invisible to exactly the sessions that needed them.
 *
 * Derived from the tree rather than hand-listed, per the #135 rule that a
 * load-bearing doc needs a gate: prose cannot survive a merge on its own.
 */

const ROOT = join(__dirname, '..', '..');
const DOCS = join(ROOT, 'docs');
const GUIDE = join(DOCS, 'AGENTS-DOCS-GUIDE.md');

function markdown(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdown(full);
    return entry.endsWith('.md') ? [full] : [];
  });
}

describe('the docs guide indexes every doc (#319)', () => {
  it('finds a plausible number of documents', () => {
    // A walk that matched nothing would make the check below vacuous.
    expect(markdown(DOCS).length).toBeGreaterThanOrEqual(15);
  });

  it('names every markdown file under docs/', () => {
    const guide = readFileSync(GUIDE, 'utf8');
    const missing = markdown(DOCS)
      .map((f) => relative(DOCS, f).split('\\').join('/'))
      // The guide does not index itself; everything else must appear.
      .filter((rel) => rel !== 'AGENTS-DOCS-GUIDE.md')
      .filter((rel) => !guide.includes(rel.split('/').pop()!));

    expect(
      missing,
      `docs/AGENTS-DOCS-GUIDE.md does not name: ${missing.join(', ')}.\n` +
        'It is the index CLAUDE.md routes through, so a document it omits is one ' +
        'agents do not find (#319).'
    ).toEqual([]);
  });

  it('never routes a reader into 99-archive as a primary source', () => {
    // The guide itself calls that directory "Read-only history — never update
    // these", while three matrix rows sent readers there first.
    const guide = readFileSync(GUIDE, 'utf8');
    const rows = guide
      .split('\n')
      .filter((line) => line.startsWith('| **') && line.includes('|'));
    expect(rows.length).toBeGreaterThanOrEqual(8);

    const offenders = rows.filter((line) => {
      const primary = line.split('|')[2] ?? '';
      return primary.includes('99-archive');
    });

    expect(
      offenders,
      `These decision-matrix rows send readers to archived docs as their primary source:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

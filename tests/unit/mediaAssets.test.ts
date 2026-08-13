import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Media assets gate — derived from the source, not a hand-maintained list.
 *
 * The previous version of this file enumerated required assets by hand. It
 * demanded two avatar files nothing rendered, said nothing about the
 * `og-image.png` that `app/layout.tsx` declares for every social share, and
 * kept 31 stale light-theme captures alive in `public/assets/demo/` because
 * deleting them broke the build (#244). A scan reading a hand-maintained
 * fixture cannot catch the drift it names (CLAUDE.md hard rule #7) — so the
 * required set is now parsed out of `app/`, `components/` and `lib/`, with a
 * plausibility floor asserting the parse actually matched.
 */

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEMO_DIR = path.join(PUBLIC_DIR, 'assets/demo');
const SOURCE_DIRS = ['app', 'components', 'lib'];

/** Quoted absolute paths ending in a media extension, e.g. '/assets/demo/x.png'. */
const ASSET_REF = /['"`](\/[A-Za-z0-9_\-./]+\.(?:png|webm|svg|jpg|jpeg|gif))['"`]/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function referencedAssets(): Set<string> {
  const refs = new Set<string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const content = fs.readFileSync(file, 'utf8');
      for (const match of content.matchAll(ASSET_REF)) {
        refs.add(match[1]);
      }
    }
  }
  return refs;
}

describe('Media Assets Integrity Suite', () => {
  const refs = referencedAssets();

  it('parsed a plausible number of asset references out of the source', () => {
    // Six landing screenshots + logo + favicon + og-image = 9 today. Well
    // under 8 means the regex or the directory walk broke, not the product.
    expect(refs.size, `parsed refs: ${[...refs].join(', ')}`).toBeGreaterThanOrEqual(8);
  });

  it('every static asset the source references exists in public/', () => {
    const missing = [...refs].filter((ref) => !fs.existsSync(path.join(PUBLIC_DIR, ref)));
    expect(
      missing,
      'A rendered <img>/metadata path with no file behind it ships a broken image.'
    ).toEqual([]);
  });

  it('public/assets/demo contains no orphan files nothing renders', () => {
    // Stale captures survive precisely because nothing looks at them (#244):
    // the SMS-era OTP modal shot sat here for months after the flow changed.
    // Regenerate via `npm run media:landing`, then delete what it no longer
    // produces.
    const orphans = fs
      .readdirSync(DEMO_DIR)
      .filter((file) => !refs.has(`/assets/demo/${file}`));
    expect(orphans).toEqual([]);
  });

  it('demo screenshots are real captures, not placeholders', () => {
    const empty = [...refs]
      .filter((ref) => ref.startsWith('/assets/demo/'))
      .filter((ref) => fs.statSync(path.join(PUBLIC_DIR, ref)).size < 10_000);
    expect(empty, 'A landing screenshot under 10KB is a stub, not a capture.').toEqual([]);
  });
});

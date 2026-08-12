import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'lightningcss';

/**
 * Every stylesheet must parse strictly.
 *
 * A malformed comment in `app/globals.css` (a stray comment terminator closing
 * one paragraph early, leaving the next paragraph as bare text) shipped to
 * `main` and split
 * the toolchain: `npm run dev` (turbopack) 500'd on every page, while
 * `npm run build` exited 0 and CI stayed green — the minifier recovered by
 * silently dropping the invalid block *and the rule after it*, which was the
 * #101 global `:focus-visible` outline. Production lost an accessibility fix
 * and nothing was red.
 *
 * `errorRecovery: false` is the whole gate: it makes the parse fail the way
 * dev fails, instead of recovering the way the build does.
 */

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith('.css')) out.push(path);
  }
  return out;
}

const files = [...cssFiles('app'), ...cssFiles('components')];

describe('stylesheets parse strictly (dev parity)', () => {
  it('found the stylesheet it exists to guard', () => {
    expect(files).toContain(join('app', 'globals.css'));
  });

  it.each(files)('%s parses with no error recovery', (file) => {
    expect(() =>
      transform({
        filename: file,
        code: readFileSync(file),
        errorRecovery: false,
      })
    ).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #290 — the footer renders on pages other than the landing (`/demo` mounts
 * it too), so its section links must be rooted (`/#precios`), not bare
 * in-page anchors (`#precios`) that only resolve where the ids exist.
 *
 * `precios` left this list in #349: pricing's canonical surface is the
 * `/pricing` **page**, so the footer links a route, not a section. #290's rule
 * is about in-page ids and is untouched for the three that remain — the
 * pricing link is guarded instead by `pricingCanonical.test.ts`, which fails
 * if it reverts to an anchor of either shape.
 */

const source = readFileSync(join(process.cwd(), 'components', 'layout', 'Footer.tsx'), 'utf8');

describe('footer section links are rooted (#290)', () => {
  it('every landing-section anchor navigates to the landing page first', () => {
    for (const anchor of ['caracteristicas', 'testimonios', 'garantia']) {
      expect(source, `#${anchor} must be rooted`).toContain(`href="/#${anchor}"`);
      expect(source).not.toContain(`href="#${anchor}"`);
    }
  });

  it('the scan is looking at a footer that still links those sections (positive control)', () => {
    expect(source.match(/href="\/#/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

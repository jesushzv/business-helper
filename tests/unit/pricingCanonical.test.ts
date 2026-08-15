import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #349 — pricing had two surfaces and the site linked the wrong one.
 *
 * `/pricing` sat in the sitemap at priority 0.9, owning the full comparison
 * table and the billing FAQ, while every "Precios" affordance on the site
 * pointed at the landing's `#precios` section. The only inbound link to
 * `/pricing` was from `/demo`, which was itself an orphan until #338: the
 * chain was orphan → orphan, and the page the crawler is told to index was the
 * page the site refused to link.
 *
 * The decision recorded there (option 1): **`/pricing` is canonical.** The
 * landing keeps a three-plan summary and links onward; the footer and the
 * landing nav point at the page. This test is that decision, in the suite
 * rather than in prose — reverting any half of it goes red.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const footer = read('components', 'layout', 'Footer.tsx');
const landing = read('app', 'page.tsx');
const sitemap = read('app', 'sitemap.ts');

describe('the canonical pricing surface is /pricing (#349)', () => {
  it('the footer links the page, not the landing section', () => {
    expect(footer).toContain('href="/pricing"');
    // Both anchor shapes: the bare one #290 already forbids, and the rooted one
    // that was correct until pricing stopped being a section.
    expect(footer).not.toContain('href="/#precios"');
    expect(footer).not.toContain('href="#precios"');
  });

  it("the landing nav links the page, so the site's own chrome agrees with the sitemap", () => {
    expect(landing).toContain('href="/pricing"');
    expect(landing).not.toContain('href="#precios"');
  });

  it('the landing section stays a summary and hands the full comparison to /pricing', () => {
    // The section itself remains — a visitor scrolling the landing still meets
    // the three plans. What it must not do is duplicate the canonical page's
    // comparison table, which is what made the two surfaces interchangeable.
    expect(landing).toContain('id="precios"');
    expect(landing).not.toContain('PricingComparisonTable');
    expect(landing).toContain('Ver todos los planes');
  });

  it('the comparison table still exists and lives on the canonical page (positive control)', () => {
    // Guards against the assertion above passing because the component was
    // deleted outright rather than moved: absence proves nothing on its own.
    expect(read('app', 'pricing', 'page.tsx')).toContain('<PricingComparisonTable />');
  });

  it('the sitemap still advertises the page the site now links', () => {
    expect(sitemap).toContain('/pricing');
  });
});

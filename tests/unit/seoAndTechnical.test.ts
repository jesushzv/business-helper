import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('WS-E SEO & Technical Polish Test Suite', () => {
  it('verifies JsonLd component exists and exports structured JSON-LD schemas', () => {
    const jsonLdPath = path.join(process.cwd(), 'components', 'seo', 'JsonLd.tsx');
    expect(fs.existsSync(jsonLdPath)).toBe(true);

    const content = fs.readFileSync(jsonLdPath, 'utf8');
    expect(content).toContain('SoftwareApplication');
    expect(content).toContain('FAQPage');
    expect(content).toContain('application/ld+json');
  });

  it('verifies landing page metadata title in page.tsx is under 60 characters to prevent SERP truncation', () => {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    // Extract metadata title string
    const match = content.match(/title:\s*['"]([^'"]+)['"]/);
    expect(match).not.toBeNull();
    if (match) {
      const title = match[1];
      expect(title.length).toBeLessThan(60);
      expect(title).toContain('Business Helper');
    }
  });

  it('verifies layout.tsx exports Open Graph and Twitter metadata tags', () => {
    const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf8');

    expect(content).toContain('openGraph');
    expect(content).toContain('twitter');
    expect(content).toContain('es_MX');
  });

  it('verifies next.config.ts includes Content-Security-Policy header', () => {
    const configPath = path.join(process.cwd(), 'next.config.ts');
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('Content-Security-Policy');
    expect(content).toContain("default-src 'self'");
  });

  it('keeps below-fold landing images lazy and the hero eager (#82)', () => {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    // This asserted `loading="lazy"` on the raw `<img>` tags. #82 moved the
    // screenshots to `next/image`, which is lazy **by default** and takes
    // `priority` for the one image that must not be — so the attribute is gone
    // while the behaviour it stood for is unchanged. Asserting the mechanism
    // rather than the property would now fail on a page that is correct.
    const images = content.match(/<Image\n/g) ?? [];
    expect(images.length).toBeGreaterThan(0);

    // Exactly one eager image: the LCP hero. More than one and `priority`
    // stops meaning anything; none and the largest image on the page waits.
    expect(content.match(/\n\s+priority\n/g) ?? []).toHaveLength(1);
    // No explicit lazy attribute is needed, and none should creep back in —
    // `loading="lazy"` alongside `priority` is a contradiction Next warns about.
    expect(content).not.toContain('loading="lazy"');
  });

  it('verifies app/sitemap.ts and app/robots.ts exist for SEO indexing', () => {
    const sitemapPath = path.join(process.cwd(), 'app', 'sitemap.ts');
    const robotsPath = path.join(process.cwd(), 'app', 'robots.ts');

    expect(fs.existsSync(sitemapPath)).toBe(true);
    expect(fs.existsSync(robotsPath)).toBe(true);
  });
});

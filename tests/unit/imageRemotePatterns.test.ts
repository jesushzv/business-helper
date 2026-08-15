import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildImageRemotePatterns } from '@/lib/imageRemotePatterns';

/**
 * #82 — what blocked the `next/image` migration, and what unblocks it.
 *
 * `getAssetUrl()` returns a relative path by default and an absolute URL on
 * `NEXT_PUBLIC_CDN_URL` / `NEXT_PUBLIC_VERCEL_BLOB_BASE_URL` when either is
 * set. `next/image` throws at request time for a hostname missing from
 * `images.remotePatterns`, and `next.config.ts` had no `images` config at all —
 * so converting the marketing screenshots would have traded a lint warning for
 * a landing page that breaks on every CDN-configured deployment.
 *
 * The hostname is deployment-specific, so it is derived here rather than
 * written in: hardcoding an origin is this repo's four-times-shipped defect
 * (#36/#47/#73/#299).
 */

describe('remotePatterns are derived from the environment (#82)', () => {
  it('is empty when no CDN is configured — same-origin paths need no pattern', () => {
    expect(buildImageRemotePatterns({})).toEqual([]);
  });

  it('derives host, protocol and port from NEXT_PUBLIC_CDN_URL', () => {
    expect(buildImageRemotePatterns({ NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com' })).toEqual([
      { protocol: 'https', hostname: 'cdn.example.com', port: '', pathname: '/**' },
    ]);
  });

  it('keeps a non-default port, which a bare hostname would drop', () => {
    const [pattern] = buildImageRemotePatterns({
      NEXT_PUBLIC_CDN_URL: 'https://assets.internal:8443',
    });
    expect(pattern.port).toBe('8443');
    expect(pattern.hostname).toBe('assets.internal');
  });

  it('covers the blob base URL too, so the fallback variable is not stranded', () => {
    const patterns = buildImageRemotePatterns({
      NEXT_PUBLIC_VERCEL_BLOB_BASE_URL: 'https://abc123.public.blob.vercel-storage.com',
    });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].hostname).toBe('abc123.public.blob.vercel-storage.com');
  });

  it('matches assets under a CDN configured with a base path', () => {
    // Assets are addressed as `${cdn}${path}`, so narrowing the pattern to the
    // CDN's own path would refuse every one of them.
    const [pattern] = buildImageRemotePatterns({
      NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com/business-helper',
    });
    expect(pattern.pathname).toBe('/**');
  });

  it('does not repeat a host set in both variables', () => {
    expect(
      buildImageRemotePatterns({
        NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com',
        NEXT_PUBLIC_VERCEL_BLOB_BASE_URL: 'https://cdn.example.com/',
      })
    ).toHaveLength(1);
  });

  it('lists both when they are genuinely different origins', () => {
    const patterns = buildImageRemotePatterns({
      NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com',
      NEXT_PUBLIC_VERCEL_BLOB_BASE_URL: 'https://blob.example.net',
    });
    expect(patterns.map((p) => p.hostname)).toEqual(['cdn.example.com', 'blob.example.net']);
  });

  it('fails the build on a value that is not a URL, naming the variable', () => {
    // The alternative to throwing is silence here and a 500 at request time
    // about `src`, pointing nowhere near the misconfigured variable —
    // `getAssetUrl()` prefixes the bad value onto every asset path regardless.
    expect(() => buildImageRemotePatterns({ NEXT_PUBLIC_CDN_URL: 'cdn.example.com' })).toThrow(
      /NEXT_PUBLIC_CDN_URL/
    );
  });

  it('refuses a non-http protocol', () => {
    expect(() =>
      buildImageRemotePatterns({ NEXT_PUBLIC_CDN_URL: 'ftp://cdn.example.com' })
    ).toThrow(/http/);
  });

  it('treats whitespace as unset rather than as a URL', () => {
    expect(buildImageRemotePatterns({ NEXT_PUBLIC_CDN_URL: '   ' })).toEqual([]);
  });
});

/**
 * The migration itself. `--max-warnings=0` already forbids a bare `<img>`, so
 * what needs guarding is the *scoped disables* coming back — the shape the
 * screenshots carried before this change.
 */
describe('the marketing screenshots use next/image (#82)', () => {
  const landing = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf8');
  const demo = readFileSync(join(process.cwd(), 'app', 'demo', 'page.tsx'), 'utf8');
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');

  it('no screenshot site still carries the #82 disable', () => {
    expect(landing).not.toContain('migration tracked in #82');
    expect(demo).not.toContain('migration tracked in #82');
  });

  it('the scan is looking at files that still render the screenshots (positive control)', () => {
    // Absence proves nothing if the sites were simply deleted. Count the PNGs:
    // six on the landing, one on /demo — re-derived, because #82's own list of
    // eight included `SmartVideoPlayer`, a component that no longer exists.
    expect(landing.match(/assets\/demo\/[a-z0-9_]+\.png/g) ?? []).toHaveLength(6);
    expect(demo.match(/assets\/demo\/[a-z0-9_]+\.png/g) ?? []).toHaveLength(1);
    expect(landing.match(/<Image\n/g) ?? []).toHaveLength(6);
    expect(demo.match(/<Image\n/g) ?? []).toHaveLength(1);
  });

  it('every converted site sets sizes, which fill without sizes silently costs', () => {
    // `fill` with no `sizes` makes the browser fetch the largest candidate for
    // every viewport — the opposite of the reason to migrate.
    for (const [name, source] of [
      ['landing', landing],
      ['demo', demo],
    ] as const) {
      const fills = source.match(/\n\s+fill\n/g) ?? [];
      const sizes = source.match(/\n\s+sizes="/g) ?? [];
      expect(sizes.length, `${name}: every fill needs a sizes`).toBe(fills.length);
      expect(fills.length).toBeGreaterThan(0);
    }
  });

  it('the SVG logos keep their disables — next/image does not optimize SVGs', () => {
    // Named so the next sweep does not "finish the job" by converting them.
    expect(landing).toContain('inline SVG logo');
    expect(demo).toContain('inline SVG logo');
  });

  it('the config wires the derived patterns rather than a literal host', () => {
    expect(config).toContain('buildImageRemotePatterns()');
    expect(config).not.toMatch(/hostname:\s*'[a-z]/i);
  });
});

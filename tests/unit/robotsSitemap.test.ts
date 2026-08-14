import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

/**
 * #299 — robots must exclude the app's REAL paths, and both metadata files
 * must build their origin through `getAppBaseUrl()`.
 *
 * The `(dashboard)` route group publishes pages at the top level, so the old
 * `disallow: ['/dashboard/']` excluded nothing that exists (and, per robots
 * prefix rules, not even `/dashboard` itself). The origin was also a literal,
 * sitting outside the `tests/unit/url.test.ts` scan, which covered `lib/`
 * only — the four-times-shipped literal-origin class with no gate.
 */

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview.example.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('robots.ts (#299)', () => {
  const disallow = () => {
    const rule = robots().rules;
    const first = Array.isArray(rule) ? rule[0] : rule;
    return ([] as string[]).concat((first?.disallow as string[] | string) || []);
  };

  it('excludes every real app page, not a /dashboard/ prefix that matches nothing', () => {
    const excluded = disallow();
    for (const path of [
      '/dashboard',
      '/quotes',
      '/clients',
      '/receivables',
      '/products',
      '/invoices',
      '/team',
      '/assistant',
      '/help',
      '/settings',
      '/admin',
      '/upgrade',
    ]) {
      expect(excluded, `${path} must be excluded from the index`).toContain(path);
    }
  });

  it('keeps token-bearing pages out of the index — their URL is the credential', () => {
    const excluded = disallow();
    for (const path of ['/q/', '/pay/', '/invitacion/']) {
      expect(excluded).toContain(path);
    }
  });

  it('builds the sitemap origin from the environment, not a literal', () => {
    expect(robots().sitemap).toBe('https://preview.example.test/sitemap.xml');
  });
});

describe('sitemap.ts (#299)', () => {
  it('builds every URL from the environment origin', () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith('https://preview.example.test')).toBe(true);
    }
  });

  it('lists only public marketing/auth pages, never app or token paths', () => {
    const paths = sitemap().map((e) => new URL(e.url).pathname);
    for (const path of paths) {
      expect(path).not.toMatch(/^\/(quotes|clients|receivables|settings|q|pay|invitacion)/);
    }
  });
});

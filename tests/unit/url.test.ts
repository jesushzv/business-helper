import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAppBaseUrl,
  getStripeWebhookUrl,
  getAssetUrl,
  getPaymentPublicUrl,
  getQuotePublicUrl,
} from '@/lib/url';

describe('Dynamic URL & Domain Resolution Engine', () => {
  it('should return valid base URL without trailing slash', () => {
    const baseUrl = getAppBaseUrl();
    expect(baseUrl).toBeDefined();
    expect(baseUrl.endsWith('/')).toBe(false);
    expect(baseUrl.startsWith('http')).toBe(true);
  });

  it('should append protocols to domain strings without http/https', () => {
    const origEnv = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'businesshelper.mx/';
    expect(getAppBaseUrl()).toBe('https://businesshelper.mx');
    process.env.NEXT_PUBLIC_APP_URL = origEnv;
  });

  it('should construct a valid Stripe webhook endpoint', () => {
    expect(getStripeWebhookUrl()).toContain('/api/stripe/webhook');
  });

  it('should resolve asset URLs with NEXT_PUBLIC_CDN_URL or fallback to local path', () => {
    const origCdn = process.env.NEXT_PUBLIC_CDN_URL;
    delete process.env.NEXT_PUBLIC_CDN_URL;
    expect(getAssetUrl('/assets/demo/video.mp4')).toBe('/assets/demo/video.mp4');

    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.businesshelper.mx';
    expect(getAssetUrl('/assets/demo/video.mp4')).toBe('https://cdn.businesshelper.mx/assets/demo/video.mp4');
    process.env.NEXT_PUBLIC_CDN_URL = origCdn;
  });
});

// The server-side branch — where the hardcoded-origin defects actually shipped
// — is covered in tests/unit/paymentPublicUrl.server.test.ts. Here, under
// jsdom, the browser's own origin wins, which is what keeps a preview
// deployment linking to itself.
describe('Public payment link builder (browser)', () => {
  it('builds /pay/<token> on the current origin, ignoring the configured one', () => {
    const orig = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.app';

    expect(getPaymentPublicUrl('quote_token_abc')).toBe(
      `${window.location.origin}/pay/quote_token_abc`
    );

    process.env.NEXT_PUBLIC_APP_URL = orig;
  });

  it('shares an origin with the quote link, so both reach the same deployment', () => {
    expect(new URL(getPaymentPublicUrl('t')).origin).toBe(
      new URL(getQuotePublicUrl('t')).origin
    );
  });
});

/**
 * The hardcoded-origin defect has shipped four times now — #36 (`businesshelper.mx`),
 * #47, and #73's pair (`business-helper.vercel.app`, `business-helper.app`, plus a
 * third builder #73 did not list). Every one was a literal origin inside a message
 * a client receives. This scans for the shape rather than the strings, so the next
 * one fails here instead of in a customer's WhatsApp.
 */
describe('No literal origins in outbound link builders', () => {
  const LIB_DIR = join(process.cwd(), 'lib');

  // lib/url.ts is the one place a literal belongs: it owns the fallback.
  const ALLOWED = new Set(['url.ts']);

  function libFiles(dir: string, prefix = ''): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return libFiles(join(dir, entry.name), rel);
      return entry.name.endsWith('.ts') ? [rel] : [];
    });
  }

  // robots.ts and sitemap.ts sat outside this scan and both carried the
  // literal — the four-times-shipped class with no gate (#299).
  const APP_METADATA_FILES = ['app/robots.ts', 'app/sitemap.ts'];

  it('no lib module hardcodes an app origin for a /pay/ or /q/ link', () => {
    const offenders: string[] = [];

    const scanTargets = [
      ...libFiles(LIB_DIR).map((rel) => ({ rel, path: join(LIB_DIR, rel) })),
      ...APP_METADATA_FILES.map((rel) => ({ rel, path: join(process.cwd(), rel) })),
    ];

    for (const { rel, path } of scanTargets) {
      if (ALLOWED.has(rel)) continue;
      const source = readFileSync(path, 'utf8');

      for (const line of source.split('\n')) {
        // Comments explain the old literals on purpose; only code counts.
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

        // A quoted origin pointing at this product's own app, in any spelling
        // it has been misspelled as.
        if (/['"`]https?:\/\/[^'"`]*business[-]?helper[^'"`]*['"`]/i.test(line)) {
          offenders.push(`${rel}: ${trimmed}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The adjacent hazard the scan above cannot see (#131).
 *
 * A helper that resolves to one fixed origin is not a *literal* origin, so the
 * scan is silent on it — and `getAuthCallbackUrl()` was exactly that: exported,
 * tested, called by nothing, with a docstring naming the very call sites that
 * were correctly using `window.location.origin` instead. A session tidying up
 * "why is this URL built by hand when there's a helper?" would have swapped
 * them in and broken Google sign-in on every Vercel preview at once, since only
 * the production origin is allow-listed in Supabase Auth.
 *
 * So the helper is gone and this keeps it gone. Every Supabase auth redirect in
 * the app is derived here rather than listed, because the issue enumerated two
 * call sites and there are three — `/reset-password` builds one too.
 */
describe('Supabase auth redirects come from the browser origin (#131)', () => {
  const AUTH_DIR = join(process.cwd(), 'app', '(auth)');

  function authPages(dir: string, prefix = ''): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return authPages(join(dir, entry.name), rel);
      return entry.name.endsWith('.tsx') ? [rel] : [];
    });
  }

  it('no module exports or calls a fixed-origin auth callback builder', () => {
    const offenders: string[] = [];
    const roots = [join(process.cwd(), 'lib'), join(process.cwd(), 'app')];

    function walk(dir: string, rel = ''): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), childRel);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const source = readFileSync(join(dir, entry.name), 'utf8');
        for (const line of source.split('\n')) {
          const trimmed = line.trim();
          // The note in lib/url.ts explaining the absence is the point.
          if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
          if (/getAuthCallbackUrl/.test(line)) offenders.push(`${childRel}: ${trimmed}`);
        }
      }
    }

    roots.forEach((root) => walk(root));
    expect(
      offenders,
      'getAuthCallbackUrl() is back. It resolves to one fixed origin, which is ' +
        'wrong for a redirect that must return the user to the host they left (#131).'
    ).toEqual([]);
  });

  it('every redirectTo in (auth) builds its origin from the browser', () => {
    const pages = authPages(AUTH_DIR);
    // A parse that matched nothing is indistinguishable from a pass, so the
    // set is asserted to be the size the tree actually has.
    expect(pages.length).toBeGreaterThanOrEqual(4);

    const redirectLines: string[] = [];
    for (const rel of pages) {
      const source = readFileSync(join(AUTH_DIR, rel), 'utf8');
      for (const line of source.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        if (/redirectTo\s*:/.test(trimmed)) redirectLines.push(`${rel}: ${trimmed}`);
      }
    }

    // login, register (OAuth) and forgot-password (recovery). #131 named two.
    expect(redirectLines).toHaveLength(3);
    for (const entry of redirectLines) {
      expect(entry, `${entry} — a fixed origin here fails on every preview`).toContain(
        'window.location.origin'
      );
    }
  });
});

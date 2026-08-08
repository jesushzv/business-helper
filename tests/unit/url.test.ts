import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAppBaseUrl,
  getAuthCallbackUrl,
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

  it('should construct valid auth callback and Stripe webhook endpoints', () => {
    expect(getAuthCallbackUrl()).toContain('/auth/callback');
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

  it('no lib module hardcodes an app origin for a /pay/ or /q/ link', () => {
    const offenders: string[] = [];

    for (const rel of libFiles(LIB_DIR)) {
      if (ALLOWED.has(rel)) continue;
      const source = readFileSync(join(LIB_DIR, rel), 'utf8');

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

import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  webpack: (config) => {
    config.resolve.extensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      ...config.resolve.extensions.filter(
        (ext: string) => !['.ts', '.tsx', '.js', '.jsx'].includes(ext)
      ),
    ];
    return config;
  },
  async headers() {
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://*.posthog.com;
      style-src 'self' 'unsafe-inline';
      worker-src 'self' blob:;
      child-src 'self' blob:;
      img-src 'self' blob: data: https:;
      font-src 'self' data: https:;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.facturapi.io https://*.posthog.com;
    `.replace(/\s{2,}/g, ' ').trim();

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Sentry browser profiling is gated behind this header — the JS
          // Self-Profiling API refuses to start without it, silently.
          { key: 'Document-Policy', value: 'js-profiling' },
        ],
      },
    ];
  },
};

/**
 * Sentry build-time integration: source map upload and the tunnel route.
 *
 * Two notes on the CSP above, which this config depends on:
 *
 * - `connect-src` does **not** name an ingest host, and must not need to.
 *   `tunnelRoute` makes the browser POST events to same-origin `/monitoring`,
 *   which `'self'` already covers, and which ad blockers do not recognise as
 *   telemetry. Removing `tunnelRoute` without adding the ingest origin to
 *   `connect-src` would drop every browser-side report.
 * - `child-src 'self' blob:` is new, for Session Replay's compression worker on
 *   Safari ≤ 15.4; `worker-src` already covered the other browsers.
 *
 * `org` and `project` are read from the environment rather than written in.
 * A wrong-but-plausible literal slug here would upload source maps to nothing
 * and report success — the placeholder-identifier trap in `docs/LESSONS.md`,
 * at build time.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Unset in local builds; source map upload is skipped and the build succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Uploads a wider set of client bundles so stack traces resolve inside
  // framework frames too, not only our own.
  widenClientFileUpload: true,

  // Same-origin proxy for events. See the CSP note above.
  tunnelRoute: '/monitoring',

  // Quiet locally, verbose in CI where the upload step is worth reading.
  silent: !process.env.CI,
});

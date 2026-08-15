/**
 * `images.remotePatterns` for `next.config.ts`, derived from the environment.
 *
 * This is what blocked #82. `getAssetUrl()` returns a **relative** path when no
 * CDN is configured, and an absolute URL on `NEXT_PUBLIC_CDN_URL` /
 * `NEXT_PUBLIC_VERCEL_BLOB_BASE_URL` when one is. Any hostname missing from
 * this list is refused by the image optimizer, so migrating the marketing
 * screenshots without it would have traded a lint warning for a landing page
 * whose every screenshot is broken on any deployment that sets a CDN.
 *
 * Measured on a production build rather than reasoned from the docs, because
 * the failure is quieter than #82 assumed. It is not a thrown "Invalid src
 * prop" — that is the dev-server behaviour. `next start` serves the page
 * **200**, and `/_next/image` answers **400 `"url" parameter is not allowed`**
 * for each screenshot: a page that looks fine to a health check and is missing
 * every image to a visitor.
 *
 * Derived, never hardcoded: the CDN hostname is deployment-specific, and
 * writing one in is this repo's four-times-shipped defect (#36/#47/#73/#299).
 * A deployment with no CDN gets an **empty** list, which is correct — the paths
 * are same-origin and need no pattern at all.
 *
 * Both variables are read, in `getAssetUrl()`'s precedence order. Only the
 * first set one is ever used to build a URL, so the second pattern is usually
 * redundant; it costs nothing and means changing that precedence cannot strand
 * the images.
 */

export interface ImageRemotePattern {
  protocol: 'http' | 'https';
  hostname: string;
  port: string;
  pathname: string;
}

/** Env vars that can point asset URLs at another origin, in precedence order. */
export const ASSET_ORIGIN_ENV_VARS = [
  'NEXT_PUBLIC_CDN_URL',
  'NEXT_PUBLIC_VERCEL_BLOB_BASE_URL',
] as const;

/**
 * Takes the env explicitly so tests can pass a literal object.
 *
 * Never read into a module-level constant: that freezes the value at import,
 * making `vi.stubEnv` a no-op and leaving no seam for the unset case (#68).
 */
export function buildImageRemotePatterns(
  // Not `NodeJS.ProcessEnv`: that type requires `NODE_ENV`, so a test passing
  // `{ NEXT_PUBLIC_CDN_URL: '…' }` is a type error — which Vitest would not
  // report, since it strips annotations rather than checking them.
  env: Record<string, string | undefined> = process.env
): ImageRemotePattern[] {
  const patterns: ImageRemotePattern[] = [];

  for (const name of ASSET_ORIGIN_ENV_VARS) {
    const raw = env[name]?.trim();
    if (!raw) continue;

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      // Loud, at build time. A value that cannot be parsed here is a value
      // `getAssetUrl()` will still prefix onto every asset path, so the
      // alternative to throwing is a landing page that 500s on request with a
      // message about `src`, pointing nowhere near the misconfigured variable.
      throw new Error(
        `${name} is set to "${raw}", which is not a valid absolute URL. ` +
          'Set it to an origin like https://cdn.example.com, or unset it to serve assets from the app itself.'
      );
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(
        `${name} must use http or https; got "${url.protocol}" in "${raw}".`
      );
    }

    const pattern: ImageRemotePattern = {
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      hostname: url.hostname,
      port: url.port,
      // The path prefix is not narrowed to the CDN URL's own path: assets are
      // addressed as `${cdn}${path}`, so a CDN configured with a base path
      // still serves them from below it.
      pathname: '/**',
    };

    const already = patterns.some(
      (p) =>
        p.protocol === pattern.protocol &&
        p.hostname === pattern.hostname &&
        p.port === pattern.port
    );
    if (!already) patterns.push(pattern);
  }

  return patterns;
}

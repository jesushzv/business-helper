/**
 * Business Helper — Dynamic URL & Domain Resolution Helper Engine
 *
 * Provides origin resolution for custom domain deployment (businesshelper.app),
 * auth callbacks, and Stripe webhook listener endpoints.
 */

/**
 * Returns the sanitized base application URL origin.
 * Strips trailing slashes and handles environment fallbacks across local dev,
 * Vercel preview URLs, and production custom domain (NEXT_PUBLIC_APP_URL).
 */
export function getAppBaseUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';

  // Ensure protocol is included
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // Strip trailing slash
  return url.replace(/\/+$/, '');
}

/**
 * Returns the absolute public URL for a quote's signing portal (/q/[token]).
 *
 * In the browser the current origin wins, so preview deployments link to
 * themselves. Server-side it falls back to getAppBaseUrl() — never a literal
 * host: this URL is embedded in the WhatsApp message a client receives, and a
 * hardcoded fallback once pointed every server-rendered link at
 * businesshelper.mx, a domain nobody owns (#36).
 */
export function getQuotePublicUrl(publicToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getAppBaseUrl();
  return `${origin}/q/${publicToken}`;
}

/**
 * Returns the Supabase auth callback redirect URL for live login / register / OTP flows.
 */
export function getAuthCallbackUrl(): string {
  return `${getAppBaseUrl()}/auth/callback`;
}

/**
 * Returns the official Stripe webhook listener endpoint URL.
 */
export function getStripeWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/stripe/webhook`;
}

/**
 * Returns the CDN or base URL origin for media assets (videos, screenshots, posters).
 * Returns relative path by default to serve bundled static assets reliably, or
 * prefixes with NEXT_PUBLIC_CDN_URL / NEXT_PUBLIC_VERCEL_BLOB_BASE_URL when explicitly set.
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const cdnUrl =
    process.env.NEXT_PUBLIC_CDN_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL;

  if (cdnUrl) {
    const sanitizedCdnUrl = cdnUrl.replace(/\/+$/, '');
    return `${sanitizedCdnUrl}${cleanPath}`;
  }

  return cleanPath;
}

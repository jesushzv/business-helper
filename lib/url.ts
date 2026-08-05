/**
 * Business Helper — Dynamic URL & Domain Resolution Helper Engine
 *
 * Provides origin resolution for custom domain deployment (e.g. businesshelper.mx),
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
 * Supports NEXT_PUBLIC_CDN_URL (Supabase Storage / Cloudflare R2 / Vercel Blob) for production deployment.
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  let blobCdnFallback = '';
  const blobStoreId =
    process.env.NEXT_PUBLIC_BLOB_STORE_ID || process.env.BLOB_STORE_ID;
  if (blobStoreId) {
    const rawId = blobStoreId.replace(/^store_/, '').toLowerCase();
    blobCdnFallback = `https://${rawId}.public.blob.vercel-storage.com`;
  }

  const cdnUrl =
    process.env.NEXT_PUBLIC_CDN_URL ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL ||
    blobCdnFallback;

  const sanitizedCdnUrl = cdnUrl ? cdnUrl.replace(/\/+$/, '') : '';
  return sanitizedCdnUrl ? `${sanitizedCdnUrl}${cleanPath}` : cleanPath;
}

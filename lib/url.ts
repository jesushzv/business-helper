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
 * Returns the absolute public URL for a milestone's SPEI payment portal (/pay/[token]).
 *
 * The token is the **quote's `public_token`** — the same value `/q/[token]` uses.
 * `/pay/[token]` looks the quote up by it and walks to the contract and its
 * milestones, so a link built from a milestone id or a contract id resolves
 * nothing and answers `404 Cobro no encontrado` in front of a paying client
 * (#72). There is no milestone-id form of this URL; if the caller has no quote
 * token it has no payment link, and must offer none rather than guess one.
 *
 * Origin resolution matches getQuotePublicUrl: the browser's own origin when
 * there is one, getAppBaseUrl() otherwise — never a literal host (#36/#47/#73).
 */
export function getPaymentPublicUrl(publicToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getAppBaseUrl();
  return `${origin}/pay/${publicToken}`;
}

/*
 * There is deliberately no `getAuthCallbackUrl()` here (#131).
 *
 * It existed, was exported, was tested, and was called by nothing — while its
 * docstring said it was "for live login / register / OTP flows", which named
 * precisely the call sites that were not using it. Those sites build the
 * redirect from `window.location.origin` instead, and that is the correct
 * form: a Supabase auth redirect has to return to the host the user is
 * actually on. `getAppBaseUrl()` resolves to one fixed origin for every
 * deployment, so wiring the helper in would have sent every Vercel preview's
 * Google sign-in to production — and each preview host must be allow-listed in
 * Supabase Auth → URL Configuration individually, so it would fail everywhere
 * but production, on Google's consent screen rather than in the app.
 *
 * The `tests/unit/url.test.ts` scan cannot catch that hazard: a helper
 * resolving to a fixed origin is not a *literal* origin. Deleting it is what
 * catches it. If a server-initiated auth flow ever needs one, it is two lines
 * to write back — and whoever writes it will have the preview-origin question
 * in front of them, which is where that decision belongs.
 */

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
/**
 * Validates a `?next=` redirect target as a same-site relative path.
 *
 * `next` rides through login, the OAuth start, the auth callback and the
 * middleware guard (#248/#249); every consumer must apply the same rule or
 * the laxest one becomes an open redirect. Accepts only paths like
 * `/invitacion/abc` — never absolute URLs, `//host` protocol-relative forms,
 * or `/\` backslash tricks.
 */
export function safeInternalPath(next: string | null | undefined): string | null {
  return next && /^\/[^/\\]/.test(next) ? next : null;
}

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

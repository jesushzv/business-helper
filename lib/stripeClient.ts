/**
 * Stripe REST client for Checkout Sessions.
 *
 * `/api/stripe/checkout` used to build a payload with `createCheckoutPayload`
 * and then return `https://checkout.stripe.com/pay/cs_test_demo_<timestamp>`
 * without ever contacting Stripe. That URL resolves to a Stripe error page, so
 * nobody could pay: every "upgrade" click was a dead end that still reported
 * success.
 *
 * This module performs the call for real. It talks to the REST API directly
 * rather than pulling in the `stripe` SDK — the payload is one form-encoded
 * POST, and the webhook receiver already verifies signatures with node:crypto,
 * so the SDK would be a dependency for a single request.
 */

import { createHash } from 'node:crypto';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2024-06-20';

/** Stripe drops a request that hangs; do not hold the user's click behind it. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export type StripeCheckoutResult =
  | { ok: true; session: StripeCheckoutSession }
  | { ok: false; code: 'NOT_CONFIGURED' | 'STRIPE_ERROR' | 'TIMEOUT'; message: string };

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return key.startsWith('sk_test_') || key.startsWith('sk_live_');
}

/**
 * Flattens a nested payload into Stripe's bracketed form encoding, e.g.
 * `line_items[0][price]=price_x` and `metadata[organization_id]=org_y`.
 *
 * Values of `undefined` and `null` are dropped rather than sent as the strings
 * "undefined"/"null", which Stripe would store verbatim in metadata.
 */
export function encodeStripeForm(
  payload: Record<string, unknown>,
  prefix = ''
): URLSearchParams {
  const params = new URLSearchParams();

  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => append(`${key}[${index}]`, item));
      return;
    }

    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        append(`${key}[${childKey}]`, childValue);
      }
      return;
    }

    params.append(key, String(value));
  };

  for (const [key, value] of Object.entries(payload)) {
    append(prefix ? `${prefix}[${key}]` : key, value);
  }

  return params;
}

/**
 * An idempotency key that is scoped to a tenant *and* to the exact request.
 *
 * Stripe rejects a key replayed with different parameters — HTTP 400,
 * `idempotency_error` — so a key built from the tenant and the clock alone is a
 * trap: `returnUrl` is the payer's current URL, and it changes the moment they
 * come back from a cancelled session (`?status=cancelled`). Same key, different
 * `success_url`, and every retry inside the same window fails with the generic
 * "no se pudo iniciar el pago" until the hour rolls over.
 *
 * Folding a fingerprint of the payload into the key keeps what the key was for
 * — a double-click sends byte-identical parameters and replays one session —
 * while a genuinely different request gets a key of its own.
 */
export function checkoutIdempotencyKey(scope: string, payload: Record<string, unknown>): string {
  const fingerprint = createHash('sha256')
    // The encoder is the same one that builds the request body, so the
    // fingerprint covers exactly what Stripe is asked to compare against.
    .update(encodeStripeForm(payload).toString())
    .digest('hex')
    .slice(0, 32);

  return `${scope}:${fingerprint}`;
}

/**
 * Creates a Checkout Session and returns the hosted payment URL Stripe issues.
 *
 * `idempotencyKey` makes a retried click reuse the session Stripe already
 * created instead of opening a second one against the same organization.
 */
export async function createCheckoutSession(
  payload: Record<string, unknown>,
  idempotencyKey?: string
): Promise<StripeCheckoutResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || !isStripeConfigured()) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'El proceso de pago aún no está disponible.',
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': STRIPE_API_VERSION,
  };

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers,
      body: encodeStripeForm(payload).toString(),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Stripe's own message names the misconfiguration (an unknown price id,
      // a live key against a test price). It is logged, not returned: it can
      // quote account state the caller has no business seeing.
      const detail = data?.error?.message || `HTTP ${response.status}`;
      console.error('[stripe] checkout session rejected:', detail);
      return {
        ok: false,
        code: 'STRIPE_ERROR',
        message: 'No se pudo iniciar el pago con Stripe.',
      };
    }

    if (!data?.id || !data?.url) {
      console.error('[stripe] checkout session response missing id/url');
      return {
        ok: false,
        code: 'STRIPE_ERROR',
        message: 'No se pudo iniciar el pago con Stripe.',
      };
    }

    return { ok: true, session: { id: data.id, url: data.url } };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[stripe] checkout session failed:', aborted ? 'timeout' : error);
    return {
      ok: false,
      code: aborted ? 'TIMEOUT' : 'STRIPE_ERROR',
      message: 'No se pudo iniciar el pago con Stripe.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

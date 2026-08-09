import crypto from 'crypto';

/**
 * Stripe webhook signature verification (server-only).
 *
 * Kept out of lib/stripe.ts on purpose: that module is imported by client
 * components (SubscriptionBillingCard), and pulling node:crypto into it would
 * drag the builtin — and this verification logic — into the browser bundle.
 */

/**
 * Why the failure is machine-readable and not just a Spanish string:
 *
 * `NOT_CONFIGURED` is a property of *this deployment* — the endpoint secret was
 * never set — while every other code is a property of the *request*. Collapsing
 * them into one 400 made a misconfigured deployment indistinguishable from a
 * forged request, both in Stripe's dashboard and to `npm run verify:webhook`:
 * an endpoint that rejects literally everything passed all four of the script's
 * rejection checks (#63).
 */
export type StripeSignatureFailure =
  | 'NOT_CONFIGURED'
  | 'MISSING_SIGNATURE'
  | 'MALFORMED_SIGNATURE'
  | 'STALE_TIMESTAMP'
  | 'INVALID_SIGNATURE';

export interface StripeSignatureResult {
  valid: boolean;
  code?: StripeSignatureFailure;
  error?: string;
}

/**
 * Verifies a Stripe webhook signature.
 *
 * The webhook route previously parsed the request body and applied whatever
 * subscription change it described, with no authentication whatsoever. Anyone
 * who knew (or guessed) an organization UUID could POST a forged
 * `customer.subscription.updated` to grant themselves the top tier, or a
 * `customer.subscription.deleted` to cancel another tenant.
 *
 * Implements Stripe's documented scheme directly rather than pulling in the SDK
 * (the repo has no `stripe` dependency): HMAC-SHA256 over `${timestamp}.${body}`
 * keyed by the endpoint secret, compared against the v1 signatures in the
 * `Stripe-Signature` header.
 *
 * @param rawBody The exact request body bytes. Re-serializing parsed JSON
 *   changes the payload and invalidates the signature.
 * @param toleranceSeconds Rejects timestamps outside this window, so a captured
 *   request cannot be replayed indefinitely.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  toleranceSeconds: number = 300,
  nowMs: number = Date.now()
): StripeSignatureResult {
  if (!secret) {
    return {
      valid: false,
      code: 'NOT_CONFIGURED',
      error: 'STRIPE_WEBHOOK_SECRET no está configurado',
    };
  }

  if (!signatureHeader) {
    return {
      valid: false,
      code: 'MISSING_SIGNATURE',
      error: 'Falta el encabezado Stripe-Signature',
    };
  }

  // Header form: t=1614556800,v1=<hex>,v1=<hex>,v0=<hex>
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of signatureHeader.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!value) continue;
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    return {
      valid: false,
      code: 'MALFORMED_SIGNATURE',
      error: 'Encabezado Stripe-Signature con formato inválido',
    };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return {
      valid: false,
      code: 'MALFORMED_SIGNATURE',
      error: 'Marca de tiempo inválida en Stripe-Signature',
    };
  }

  const ageSeconds = Math.abs(nowMs / 1000 - timestampSeconds);
  if (ageSeconds > toleranceSeconds) {
    return {
      valid: false,
      code: 'STALE_TIMESTAMP',
      error: 'La marca de tiempo del webhook está fuera de tolerancia',
    };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // Stripe may send several v1 signatures during a secret rotation; any match
  // is valid. Compared in constant time so the check cannot be probed byte by
  // byte via response timing.
  const matched = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });

  if (!matched) {
    return { valid: false, code: 'INVALID_SIGNATURE', error: 'Firma de webhook inválida' };
  }

  return { valid: true };
}

/** Builds a signature header for a payload — used by tests and local replay. */
export function signStripePayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

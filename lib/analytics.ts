/**
 * Business Helper — Product Analytics
 *
 * Seven events describe the whole quote-to-cash loop:
 *
 *   signup_started -> signup_completed -> client_created -> quote_created
 *   -> quote_sent -> quote_signed -> payment_confirmed
 *
 * The point of instrumenting them is not a dashboard. It is that a weak launch
 * has three very different explanations — users did not want the product, users
 * wanted it but could not finish onboarding, or something was broken — and
 * without a funnel those are indistinguishable. The first is a reason to pivot;
 * the other two are reasons to fix something small. See issue #37.
 *
 * **Why no vendor SDK.** Every third party in this codebase (Twilio, Facturapi,
 * Stripe) is called over its HTTP API with `fetch`, and no SDK is in
 * `package.json`. PostHog's capture endpoint is one POST, so analytics follows
 * the same shape. That also keeps the browser bundle free of a tracking script:
 * the browser posts to our own `/api/analytics/event`, and only the server ever
 * talks to PostHog. The cost of this choice is that autocapture, pageviews and
 * session recording are not available — the seven events above are, which is
 * what the funnel needs.
 *
 * **Why properties are filtered.** Event properties end up in a third-party
 * system that is not covered by the organization's own data-processing
 * arrangements, so RFCs, CLABEs, phone numbers, emails and personal names must
 * not reach it. {@link sanitizeEventProperties} drops them both by property
 * name and by value shape, so a mistake at a call site fails closed.
 *
 * Every event carries `organization_id` so funnels can be segmented per tenant —
 * that is what makes KR 1.2 (trial-to-paid) and KR 1.3 (onboarding completion)
 * measurable rather than merely stated.
 */

/** The seven events that make the launch readable. Nothing else is captured. */
export const PRODUCT_EVENTS = [
  'signup_started',
  'signup_completed',
  'client_created',
  'quote_created',
  'quote_sent',
  'quote_signed',
  'payment_confirmed',
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/**
 * Events the browser may ask the server to record.
 *
 * The rest happen at a server boundary where the write they describe actually
 * lands, and are recorded there — a browser cannot claim a quote was signed or
 * a payment confirmed.
 */
export const CLIENT_REPORTABLE_EVENTS = [
  'signup_started',
  'signup_completed',
  'quote_sent',
] as const;

/**
 * The subset of those that may be recorded without a session, because they
 * happen before the account exists. Anything else reported by an
 * unauthenticated caller is refused rather than attributed to an anonymous id.
 */
export const ANONYMOUS_EVENTS = ['signup_started', 'signup_completed'] as const;

export type AnalyticsPropertyValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

/** PostHog US cloud. Set POSTHOG_HOST for EU cloud or a self-hosted instance. */
const DEFAULT_HOST = 'https://us.i.posthog.com';

/** A capture must never become the slowest thing in a request. */
const CAPTURE_TIMEOUT_MS = 2_500;

const MAX_PROPERTIES = 25;
const MAX_STRING_LENGTH = 200;

/**
 * Property-name tokens that mark a value as personal data.
 *
 * Matching is on tokens (`client_name` -> `client`, `name`), not substrings, so
 * `quote_id` survives while `contact_name` does not.
 */
const SENSITIVE_TOKENS = new Set([
  'name',
  'nombre',
  'email',
  'correo',
  'mail',
  'phone',
  'tel',
  'telefono',
  'whatsapp',
  'rfc',
  'curp',
  'clabe',
  'account',
  'cuenta',
  'address',
  'direccion',
  'calle',
  'cp',
  'zip',
  'postal',
  'ip',
  'otp',
  'password',
  'secret',
  'token',
  'signature',
  'firma',
  'seal',
]);

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

export function isProductEvent(value: unknown): value is ProductEvent {
  return typeof value === 'string' && (PRODUCT_EVENTS as readonly string[]).includes(value);
}

export function isClientReportableEvent(value: unknown): value is ProductEvent {
  return typeof value === 'string' && (CLIENT_REPORTABLE_EVENTS as readonly string[]).includes(value);
}

export function requiresSession(event: ProductEvent): boolean {
  return !(ANONYMOUS_EVENTS as readonly string[]).includes(event);
}

export function getAnalyticsKey(env: Record<string, string | undefined> = process.env): string {
  return (env.POSTHOG_API_KEY || '').trim();
}

export function getAnalyticsHost(env: Record<string, string | undefined> = process.env): string {
  const host = (env.POSTHOG_HOST || '').trim();
  if (!host.startsWith('https://')) return DEFAULT_HOST;
  return host.replace(/\/+$/, '');
}

/**
 * True when a real PostHog project key is present.
 *
 * Without one every capture is a no-op that costs nothing — local development
 * and the marketing demo deployment do not send events, and no call site has to
 * check first.
 */
export function isAnalyticsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const key = getAnalyticsKey(env);
  return key.startsWith('phc_') && key.length >= 20;
}

/**
 * True for a string that looks like personal data whatever it was named.
 *
 * The name filter catches deliberate mistakes; this catches the accidental ones
 * — a phone number passed as `contact`, a CLABE passed as `reference`.
 */
function looksPersonal(value: string): boolean {
  if (EMAIL_PATTERN.test(value)) return true;
  if (RFC_PATTERN.test(value.trim())) return true;

  // A run of 10–18 digits with no letters is a phone number, a CLABE or a card.
  // Timestamps and dates carry letters or fewer digits, so they survive.
  if (!/[a-zA-Z]/.test(value)) {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 18) return true;
  }

  return false;
}

function isSensitiveKey(key: string): boolean {
  const tokens = key.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => SENSITIVE_TOKENS.has(token));
}

/**
 * Reduces arbitrary call-site properties to values that are safe to send.
 *
 * Drops personal data, anything that is not a scalar, and anything beyond the
 * property cap; truncates long strings. In development it says what it dropped,
 * so a call site leaking PII is noticed while it is being written rather than
 * after the data has left.
 */
export function sanitizeEventProperties(properties: unknown): AnalyticsProperties {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};

  const source = properties as Record<string, unknown>;
  const clean: AnalyticsProperties = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    if (Object.keys(clean).length >= MAX_PROPERTIES) {
      dropped.push(key);
      continue;
    }

    if (value === null || value === undefined) continue;

    // A boolean derived from personal data is not personal data: `has_rfc` says
    // whether the client can be invoiced, and one bit cannot identify anyone.
    // The name filter therefore applies to values that could carry an identity.
    if (typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }

    if (isSensitiveKey(key)) {
      dropped.push(key);
      continue;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) clean[key] = value;
      else dropped.push(key);
      continue;
    }

    if (typeof value === 'string') {
      if (looksPersonal(value)) {
        dropped.push(key);
        continue;
      }
      clean[key] = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
      continue;
    }

    // Objects and arrays are dropped rather than serialized: a nested payload
    // is exactly how a whole client record ends up in an analytics property.
    dropped.push(key);
  }

  if (dropped.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('[analytics] dropped properties (personal data or unsupported type):', dropped.join(', '));
  }

  return clean;
}

export interface CaptureOptions {
  /** The person the funnel step belongs to — a user id, or an anonymous id before signup. */
  distinctId: string;
  /** The tenant, present on every event so funnels can be segmented per organization. */
  organizationId?: string | null;
  properties?: Record<string, unknown>;
  /** ISO 8601. Defaults to now; pass the write's own timestamp when there is one. */
  timestamp?: string;
}

export interface CapturePayload {
  api_key: string;
  event: ProductEvent | '$identify';
  distinct_id: string;
  timestamp: string;
  properties: Record<string, AnalyticsPropertyValue>;
}

export interface CaptureResult {
  captured: boolean;
  /** Why nothing was sent. Absent on success. */
  reason?: string;
}

export function buildCapturePayload(
  event: ProductEvent,
  options: CaptureOptions,
  env: Record<string, string | undefined> = process.env
): CapturePayload {
  const properties = sanitizeEventProperties(options.properties);

  return {
    api_key: getAnalyticsKey(env),
    event,
    distinct_id: options.distinctId,
    timestamp: options.timestamp || new Date().toISOString(),
    properties: {
      ...properties,
      organization_id: options.organizationId || 'none',
      $lib: 'business-helper',
    },
  };
}

/**
 * Records one product event. Never throws and never rejects.
 *
 * Analytics is instrumentation, not a feature: a capture that fails must leave
 * the quote created and the payment confirmed. Callers get a {@link CaptureResult}
 * they are free to ignore.
 */
export async function captureEvent(
  event: ProductEvent,
  options: CaptureOptions,
  env: Record<string, string | undefined> = process.env
): Promise<CaptureResult> {
  if (!isProductEvent(event)) return { captured: false, reason: 'unknown_event' };
  if (!options.distinctId) return { captured: false, reason: 'missing_distinct_id' };
  if (!isAnalyticsConfigured(env)) return { captured: false, reason: 'not_configured' };

  try {
    const response = await fetch(`${getAnalyticsHost(env)}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCapturePayload(event, options, env)),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });

    if (!response.ok) return { captured: false, reason: `http_${response.status}` };
    return { captured: true };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error';
    return { captured: false, reason };
  }
}

/**
 * Merges the anonymous person who started signing up into the account they
 * created.
 *
 * `signup_started` is recorded against a browser-side anonymous id because
 * there is no user yet; every later event is recorded against the user id. Left
 * alone that is two people in PostHog and a funnel that drops 100% at step two.
 * This is the standard `$identify` alias that stitches them together.
 */
export async function aliasAnonymousId(
  distinctId: string,
  anonymousId: string,
  env: Record<string, string | undefined> = process.env
): Promise<CaptureResult> {
  if (!distinctId || !anonymousId || distinctId === anonymousId) {
    return { captured: false, reason: 'nothing_to_alias' };
  }
  if (!isAnalyticsConfigured(env)) return { captured: false, reason: 'not_configured' };

  try {
    const response = await fetch(`${getAnalyticsHost(env)}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: getAnalyticsKey(env),
        event: '$identify',
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        properties: { $anon_distinct_id: anonymousId, $lib: 'business-helper' },
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });

    if (!response.ok) return { captured: false, reason: `http_${response.status}` };
    return { captured: true };
  } catch {
    return { captured: false, reason: 'network_error' };
  }
}

/** Anonymous ids are minted by the browser, so the server accepts only this shape. */
export function sanitizeAnonymousId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9-]{8,64}$/.test(trimmed) ? trimmed : null;
}

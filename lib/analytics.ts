/**
 * Product analytics — the core business funnel.
 *
 * Sends events to PostHog over its plain capture API. No SDK, matching how
 * every other third party in this codebase is called (raw REST — see the
 * launch memo §02). Works from both client components and API routes.
 *
 * Three rules, in order of importance:
 *
 * 1. **Analytics must never break the product.** Every path here swallows its
 *    own failures. A lost event is noise; a checkout that failed because
 *    PostHog was down would be the tail wagging the dog.
 * 2. **No PII in properties.** RFC, CLABE, phones, emails and names stay out —
 *    the funnel needs counts and organization_id for segmentation, nothing
 *    more. `sanitizeEventProperties` enforces this structurally.
 * 3. **No key, no-op.** Without NEXT_PUBLIC_POSTHOG_KEY nothing is sent and
 *    nothing errors, so the demo deployment and local dev stay silent.
 */

/** Core conversion and operations events, captured only after the action succeeds. */
export const ANALYTICS_EVENTS = [
  'signup_started',
  'signup_completed',
  'organization_created',
  'settlement_account_configured',
  'client_created',
  'product_created',
  'quote_created',
  'quote_sent',
  'quote_signed',
  'quote_converted',
  'payment_confirmed',
  'cfdi_issued',
  'subscription_checkout_started',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** @deprecated Use ANALYTICS_EVENTS for the full core event contract. */
export const FUNNEL_EVENTS = ANALYTICS_EVENTS;
/** @deprecated Use AnalyticsEvent. */
export type FunnelEvent = AnalyticsEvent;

/** Keys that must never reach an analytics property, whatever the caller sends. */
const PII_KEYS = new Set([
  'phone',
  'client_phone',
  'email',
  'client_email',
  'rfc',
  'clabe',
  'name',
  'client_name',
  'business_name',
  'contact_name',
  'password',
  'address',
]);

export function isAnalyticsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

/**
 * Ingestion host. Defaults to US cloud so that setting only the key is enough —
 * a required host is a second thing to forget, and forgetting it makes every
 * event vanish with no error (rule 1 hides the failure, so nothing would say so).
 * Set the EU host explicitly if the PostHog project lives there.
 */
function analyticsHost(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
}

export function sanitizeEventProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_KEYS.has(key.toLowerCase())) continue;
    // Nested objects are where PII hides (a whole client row passed "for
    // context"). Scalars only.
    if (value !== null && typeof value === 'object') continue;
    clean[key] = value;
  }
  return clean;
}

const DISTINCT_ID_STORAGE_KEY = 'bh_analytics_distinct_id';

/**
 * Where the browser's distinct id comes from when posthog-js is running.
 *
 * Two systems now send events: this raw capture path and the posthog-js SDK
 * (`components/PostHogInit.tsx`). posthog-js owns an identity of its own and
 * merges anonymous → identified when `identify()` is called. If this module
 * minted a *second* id, the same person would arrive under two of them and
 * `signup_started → signup_completed` would never join — which is the one
 * question #37 exists to answer. So posthog-js is asked for the id whenever it
 * is initialized, and the localStorage id below is only the fallback for when
 * it is not.
 */
let browserDistinctIdSource: (() => string | null | undefined) | null = null;

export function setBrowserDistinctIdSource(
  source: (() => string | null | undefined) | null
): void {
  browserDistinctIdSource = source;
}

/**
 * A stable pseudonymous id for this browser, so signup_started and
 * signup_completed join into one funnel row before any account exists.
 */
function browserDistinctId(): string {
  try {
    const shared = browserDistinctIdSource?.();
    if (shared) return shared;

    const existing = localStorage.getItem(DISTINCT_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DISTINCT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'anon-unavailable';
  }
}

export interface CaptureOptions {
  /**
   * Explicit actor id — required from server code, where there is no browser
   * identity. Use the user id, or `org:<id>` where the actor is a signer or
   * payer outside the tenant (their identity is PII; the organization's is not).
   */
  distinctId?: string;
}

/**
 * Sends one event. Resolves when the send settles; never rejects.
 * Prefer {@link track} at call sites — the funnel should never be awaited.
 */
export async function capture(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
  options: CaptureOptions = {}
): Promise<void> {
  try {
    const host = analyticsHost();
    if (!isAnalyticsConfigured() || !host) return;

    const distinctId =
      options.distinctId || (typeof window !== 'undefined' ? browserDistinctId() : 'server');

    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...sanitizeEventProperties(properties), $lib: 'business-helper' },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Rule 1. A funnel event is never worth a user-visible failure.
  }
}

/** Fire-and-forget wrapper — the standard call site form. */
export function track(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
  options: CaptureOptions = {}
): void {
  void capture(event, properties, options);
}

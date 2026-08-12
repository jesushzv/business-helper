/**
 * Business Helper — personal-data scrubbing for everything the Sentry SDK sends.
 *
 * Why this is its own module, separate from `lib/sentry.ts`:
 *
 * Before `@sentry/nextjs`, the only way an error reached Sentry was a hand
 * written `captureException()` call, so scrubbing inside that function covered
 * every payload by construction. The SDK breaks that assumption — it captures
 * unhandled server errors, React render errors, `onRequestError`, breadcrumbs,
 * console output and spans on its own, none of which pass through our adapter.
 * Scrubbing that lived in the adapter would therefore cover a shrinking minority
 * of what leaves the process, which is the #52 exit criterion quietly failing
 * open: "no RFC, CLABE, phone number or email appears in the payload".
 *
 * So the scrubbers live here and are installed as `beforeSend` / `beforeSendLog`
 * in all three runtime configs. That is the one hook every event passes through,
 * whoever created it.
 *
 * The regexes are unchanged from the raw-REST implementation — they are the part
 * of #52 that was already right, and `tests/unit/sentryScrub.test.ts` still pins
 * the Postgres-constraint case that motivated them.
 */

import type { Event, Breadcrumb } from '@sentry/nextjs';

/** Keys whose value is personal data whatever it looks like. Mirrors `lib/analytics.ts`. */
const PII_KEYS = new Set([
  'phone',
  'client_phone',
  'email',
  'client_email',
  'rfc',
  'clabe',
  'bank_clabe',
  'name',
  'client_name',
  'business_name',
  'contact_name',
  'account_holder',
  'password',
  'token',
  'address',
]);

/** Tags that identify the tenant and the code path — the whole point of the report. */
const KEPT_TAGS = new Set(['organization_id', 'user_id', 'route', 'severity']);

/** Request headers that carry credentials or identity, dropped whole. */
const DROPPED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

/**
 * Redacts personal data that appears *inside* free text.
 *
 * Key-based filtering alone is not enough here, and that is the difference
 * between this and the analytics scrubber. The strings that reach Sentry are
 * error messages and stack traces, and Postgres quotes the offending value in
 * the message: `duplicate key value violates unique constraint … (clabe)=(0121…)`.
 * No key is involved — the CLABE is in the prose.
 *
 * Each pattern is anchored with `(?<![\w-])` / `(?![\w-])` rather than `\b` so a
 * digit run inside a UUID cannot match: `organization_id` is a uuid and is
 * required to survive (#52's exit criterion names it).
 */
export function scrubText(input: string): string {
  return (
    input
      // Email first: an address can contain digit runs the later rules would
      // otherwise bite into, leaving a half-redacted address.
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
      // RFC: 3–4 letters, 6 date digits, 3 homoclave characters.
      .replace(/(?<![\w-])[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}(?![\w-])/gi, '[rfc]')
      // CLABE is exactly 18 digits; run it before the phone rule so an 18-digit
      // account number is never reported as a phone number.
      .replace(/(?<![\w-])\d{18}(?![\w-])/g, '[clabe]')
      .replace(/(?<![\w-])\d{10,13}(?![\w-])/g, '[phone]')
  );
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  // Nested objects are where a whole client row passed "for context" hides.
  return '[object omitted]';
}

export function scrubExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (PII_KEYS.has(key.toLowerCase())) continue;
    clean[key] = scrubValue(value);
  }
  return clean;
}

export function scrubTags(tags: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (KEPT_TAGS.has(key)) {
      clean[key] = String(value);
      continue;
    }
    if (PII_KEYS.has(key.toLowerCase())) continue;
    clean[key] = scrubText(String(value));
  }
  return clean;
}

/**
 * Tags as the SDK models them: values are primitives, not just strings, and the
 * SDK sets some of its own. Same rules as `scrubTags`, widened to that type.
 */
function scrubEventTags(tags: NonNullable<Event['tags']>): NonNullable<Event['tags']> {
  const clean: NonNullable<Event['tags']> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (KEPT_TAGS.has(key)) {
      clean[key] = value;
      continue;
    }
    if (PII_KEYS.has(key.toLowerCase())) continue;
    clean[key] = typeof value === 'string' ? scrubText(value) : value;
  }
  return clean;
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  if (typeof crumb.message === 'string') crumb.message = scrubText(crumb.message);
  if (crumb.data) crumb.data = scrubExtra(crumb.data);
  return crumb;
}

/**
 * `beforeSend` — the single choke point every error event passes through.
 *
 * Mutates in place and returns the event, which is the shape the SDK expects.
 * Never returns `null`: dropping an event is losing a production report, and
 * nothing here is a reason to. Scrub, then send.
 */
export function scrubEvent<T extends Event>(event: T): T {
  if (typeof event.message === 'string') event.message = scrubText(event.message);

  if (event.logentry?.message) {
    event.logentry.message = scrubText(event.logentry.message);
  }

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
    for (const frame of value.stacktrace?.frames ?? []) {
      // `includeLocalVariables: true` attaches every local in scope at the throw
      // site. On a route that just read a client row, that is the row.
      if (frame.vars) frame.vars = scrubExtra(frame.vars);
    }
  }

  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);

  if (event.extra) event.extra = scrubExtra(event.extra);
  if (event.tags) event.tags = scrubEventTags(event.tags);

  if (event.request) {
    const request = event.request;
    if (request.url) request.url = scrubText(request.url);
    if (request.query_string && typeof request.query_string === 'string') {
      request.query_string = scrubText(request.query_string);
    }
    // Cookies are a session, not a diagnostic.
    delete request.cookies;
    if (request.headers) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(request.headers)) {
        if (DROPPED_HEADERS.has(key.toLowerCase())) continue;
        headers[key] = scrubText(String(value));
      }
      request.headers = headers;
    }
    if (request.data && typeof request.data === 'object') {
      request.data = scrubExtra(request.data as Record<string, unknown>);
    } else if (typeof request.data === 'string') {
      request.data = scrubText(request.data);
    }
  }

  // The tenant is identified by `organization_id`/`user_id` tags, which survive
  // above. Everything else on `user` is the person's identity, not the defect's.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}

/** The subset of a Sentry log the scrubber touches. Structural, so the SDK's own type satisfies it. */
export interface ScrubbableLog {
  level?: string;
  message?: unknown;
  attributes?: Record<string, unknown>;
}

/**
 * `beforeSendLog` — same treatment for the Logs product.
 *
 * Console capture is enabled, so anything the app has ever `console.error`'d
 * becomes a transmitted log. That includes Postgres error text, which is exactly
 * where the CLABE-in-the-prose case came from.
 */
export function scrubLog<T extends ScrubbableLog>(log: T): T {
  if (typeof log.message === 'string') log.message = scrubText(log.message);
  if (log.attributes) log.attributes = scrubExtra(log.attributes);
  return log;
}

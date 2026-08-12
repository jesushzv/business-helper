/**
 * Business Helper — error monitoring (#52).
 *
 * This module used to be a shim: it formatted a payload, checked whether a DSN
 * looked plausible, and then `console.error`'d in both branches. Nothing left
 * the process, while `dispatchedToSentry: true` said otherwise — hard rule #1
 * in its purest form, on the one mechanism that reports a production 500 when
 * nobody is watching. `app/global-error.tsx` told users *"Nuestro equipo ha sido
 * notificado automáticamente"*, which nothing made true.
 *
 * It now transmits, over Sentry's envelope endpoint with `fetch`. No SDK: every
 * third-party integration here is raw REST (`lib/stripeClient.ts`,
 * `lib/pacClient.ts`, `lib/otpDelivery.ts`, `lib/analytics.ts`), and
 * `@sentry/nextjs` would add build-time instrumentation and a source-map upload
 * step for a payload this module already assembles.
 *
 * Three rules, the same three `lib/analytics.ts` follows:
 *
 * 1. **No DSN, no send, and it says so.** An unset DSN logs to console with a
 *    prefix naming the fact that nothing was transmitted, and reports
 *    `dispatchedToSentry: false`. Never a fabricated dispatch.
 * 2. **Never throws, never blocks.** Callers are `catch` blocks and React error
 *    boundaries; monitoring must not turn a handled error into a second one.
 * 3. **Scrub before sending.** Stack traces and error messages carry more
 *    personal data than analytics properties do — a Postgres unique-violation
 *    message quotes the offending CLABE verbatim.
 */

export interface ErrorContext {
  organization_id?: string;
  user_id?: string;
  route?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info';
  environment?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface FormattedErrorPayload {
  name: string;
  message: string;
  stack: string | null;
  timestamp: string;
  environment: string;
  tags: {
    organization_id: string;
    user_id: string;
    route: string;
    severity: string;
    [key: string]: string;
  };
  extra: Record<string, unknown>;
}

export interface CaptureResult {
  handled: boolean;
  /**
   * A transmission was **started** — not a claim that Sentry accepted it.
   * `delivery` is the only thing that knows that, and it resolves later.
   * `false` means nothing was sent at all.
   */
  dispatchedToSentry: boolean;
  /**
   * Resolves `true` only once Sentry has answered 2xx. Absent when no send was
   * started. Present so a test — or a verification script — can await the real
   * outcome instead of trusting the flag above.
   */
  delivery?: Promise<boolean>;
  payload:
    | FormattedErrorPayload
    | { message: string; level: string; timestamp: string; tags: Record<string, string> };
}

/* ------------------------------------------------------------------ *
 * DSN
 * ------------------------------------------------------------------ */

export interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
  path: string;
}

/**
 * Parses `{protocol}://{publicKey}@{host}{path}/{projectId}`.
 *
 * The previous check was `dsn.includes('@sentry')`, which **no modern Sentry
 * DSN satisfies** — they are issued as `https://<key>@o123.ingest.us.sentry.io/456`,
 * where the character after `@` is the org prefix. So the old
 * `isSentryConfigured()` returned `false` for every correctly configured
 * deployment, and `true` only for the shape in its own test. Parsing the URL
 * replaces guessing at its spelling, and accepts self-hosted Sentry too.
 */
export function parseSentryDsn(dsn: string | undefined | null): SentryDsn | null {
  if (!dsn || typeof dsn !== 'string') return null;

  try {
    const url = new URL(dsn.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const publicKey = url.username;
    if (!publicKey) return null;

    // The project id is the last path segment; anything before it is a path
    // prefix, which self-hosted installs behind a subdirectory do use.
    const segments = url.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    if (!projectId || !/^\d+$/.test(projectId)) return null;

    return {
      publicKey,
      host: url.host,
      projectId,
      protocol: url.protocol,
      path: segments.length ? `/${segments.join('/')}` : '',
    };
  } catch {
    return null;
  }
}

function resolveDsn(env: Record<string, string | undefined>): SentryDsn | null {
  return parseSentryDsn(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN);
}

export function isSentryConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return resolveDsn(env) !== null;
}

export function envelopeEndpoint(dsn: SentryDsn): string {
  return `${dsn.protocol}//${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

/* ------------------------------------------------------------------ *
 * Scrubbing
 * ------------------------------------------------------------------ */

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

function scrubTags(tags: Record<string, string>): Record<string, string> {
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

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

export function formatErrorPayload(
  error: unknown,
  context: ErrorContext = {}
): FormattedErrorPayload {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const name = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? error.stack || null : null;

  return {
    name,
    message: scrubText(message),
    stack: stack ? scrubText(stack) : null,
    timestamp: new Date().toISOString(),
    environment: context.environment || process.env.NODE_ENV || 'development',
    tags: scrubTags({
      organization_id: context.organization_id || 'anonymous',
      user_id: context.user_id || 'unauthenticated',
      route: context.route || 'unknown',
      severity: context.level || 'error',
      ...context.tags,
    }) as FormattedErrorPayload['tags'],
    extra: scrubExtra(context.extra || {}),
  };
}

function eventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    /* fall through */
  }
  let out = '';
  while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16);
  return out.slice(0, 32);
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/**
 * POSTs one event as a Sentry envelope.
 *
 * Resolves `false` rather than throwing on any failure: the caller is always a
 * `catch` block or an error boundary, and an unreachable monitoring host must
 * not become the error the user sees.
 */
export async function sendEnvelope(
  dsn: SentryDsn,
  event: Record<string, unknown>
): Promise<boolean> {
  try {
    const id = String(event.event_id);
    const header = JSON.stringify({
      event_id: id,
      sent_at: new Date().toISOString(),
    });
    const itemHeader = JSON.stringify({ type: 'event', content_type: 'application/json' });
    const body = `${header}\n${itemHeader}\n${JSON.stringify(event)}`;

    const res = await fetch(envelopeEndpoint(dsn), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': [
          'Sentry sentry_version=7',
          `sentry_key=${dsn.publicKey}`,
          'sentry_client=business-helper/1.0',
        ].join(', '),
      },
      // The process may be torn down right after an unhandled error; keepalive
      // is what stops the report dying with it.
      keepalive: true,
      body,
    });

    return res.ok;
  } catch {
    return false;
  }
}

function buildEvent(
  payload: FormattedErrorPayload,
  level: string
): Record<string, unknown> {
  return {
    event_id: eventId(),
    timestamp: payload.timestamp,
    platform: typeof window === 'undefined' ? 'node' : 'javascript',
    logger: 'business-helper',
    level,
    environment: payload.environment,
    tags: payload.tags,
    extra: { ...payload.extra, ...(payload.stack ? { stack: payload.stack } : {}) },
    exception: {
      values: [{ type: payload.name, value: payload.message }],
    },
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function captureException(
  error: unknown,
  context: ErrorContext = {},
  env: Record<string, string | undefined> = process.env
): CaptureResult {
  const payload = formatErrorPayload(error, context);
  const dsn = resolveDsn(env);

  if (!dsn) {
    // Named for what it is. The old message implied a capture had happened.
    console.error('[MONITOR NOT CONFIGURED — NOTHING TRANSMITTED]', payload.message, {
      route: payload.tags.route,
      org: payload.tags.organization_id,
    });
    return { handled: true, dispatchedToSentry: false, payload };
  }

  // Not awaited: every caller is synchronous, and blocking a `catch` block on a
  // network round trip to the monitoring host would make an outage there an
  // outage here. The promise is returned so a caller that *can* wait may.
  const delivery = sendEnvelope(dsn, buildEvent(payload, payload.tags.severity));

  return { handled: true, dispatchedToSentry: true, delivery, payload };
}

export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' = 'info',
  context: ErrorContext = {},
  env: Record<string, string | undefined> = process.env
): CaptureResult {
  const dsn = resolveDsn(env);
  const scrubbed = scrubText(String(message));

  const payload = {
    message: scrubbed,
    level,
    timestamp: new Date().toISOString(),
    tags: scrubTags({
      organization_id: context.organization_id || 'anonymous',
      route: context.route || 'unknown',
      severity: level,
      ...context.tags,
    }),
  };

  if (!dsn) {
    console.log(`[MONITOR NOT CONFIGURED — NOTHING TRANSMITTED:${level.toUpperCase()}]`, scrubbed);
    return { handled: true, dispatchedToSentry: false, payload };
  }

  const delivery = sendEnvelope(dsn, {
    event_id: eventId(),
    timestamp: payload.timestamp,
    platform: typeof window === 'undefined' ? 'node' : 'javascript',
    logger: 'business-helper',
    level,
    environment: context.environment || process.env.NODE_ENV || 'development',
    message: { formatted: scrubbed },
    tags: payload.tags,
    extra: scrubExtra(context.extra || {}),
  });

  return { handled: true, dispatchedToSentry: true, delivery, payload };
}

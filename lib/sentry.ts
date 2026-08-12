/**
 * Business Helper — error monitoring (#52), now on the official Next.js SDK.
 *
 * ## What this module is
 *
 * A thin adapter over `@sentry/nextjs`. It exists so the ~29 call sites across
 * `app/api/*`, `lib/dbWriteError.ts`, `lib/errorCopy.ts` and the two error
 * boundaries keep their tenant-aware signature —
 * `captureException(err, { organization_id, route, level })` — instead of each
 * one hand-rolling a Sentry scope. Call sites did not change when the transport
 * did, and will not change again.
 *
 * ## Why the transport changed
 *
 * This module used to POST Sentry envelopes with `fetch`, on the reasoning that
 * every other integration here is raw REST. That was right about the house style
 * and wrong about the coverage: a hand-rolled transport only ever sees errors
 * someone remembered to hand it. It could not see an unhandled Server Component
 * error, a React render error, an Edge middleware throw, or anything in a route
 * that returned before reaching its `catch`. `instrumentation.ts`'s
 * `onRequestError` sees all of them, and that is most of what a production 500
 * actually is.
 *
 * ## What did not change
 *
 * The three rules the raw-REST version was built on still hold, and the tests
 * that pin them still pass:
 *
 * 1. **No DSN, no send, and it says so.** An uninitialised or DSN-less client
 *    logs with a prefix naming the fact that nothing was transmitted, and
 *    reports `dispatchedToSentry: false`. Never a fabricated dispatch.
 * 2. **Never throws, never blocks.** Callers are `catch` blocks and React error
 *    boundaries; monitoring must not turn a handled error into a second one.
 * 3. **Scrub before sending.** Now installed as `beforeSend` in all three
 *    runtime configs rather than applied here — see `lib/sentryScrub.ts` for why
 *    that move was required rather than cosmetic.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubExtra, scrubTags, scrubText } from '@/lib/sentryScrub';

// Re-exported because callers and tests have imported them from here since #52,
// and where a payload is assembled by hand the scrubbers must stay reachable.
export { scrubText, scrubExtra } from '@/lib/sentryScrub';

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
   * The event was handed to an **initialised Sentry client with a DSN** — not a
   * claim that Sentry accepted it. `false` means nothing was sent at all,
   * because no such client exists in this runtime.
   */
  dispatchedToSentry: boolean;
  /**
   * Resolves once the client's transport queue has drained, `true` if it drained
   * within the timeout and `false` if it did not. Absent when no send was
   * started.
   *
   * Note the weaker guarantee than the raw-REST version this replaced, which
   * resolved on a 2xx from the envelope endpoint: `Sentry.flush()` reports that
   * the queue emptied, and it covers whatever else was queued, not this event
   * alone. It is a "the transport got it out" signal, not an acknowledgement.
   * The Sentry Issues dashboard remains the only proof of receipt.
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
 * Kept after the SDK migration because `isSentryConfigured()` is still asked —
 * by deployment checks and by tests — whether this environment is configured to
 * report, and that question has a wrong answer with history. The check used to
 * be `dsn.includes('@sentry')`, which **no modern Sentry DSN satisfies**: they
 * are issued as `https://<key>@o123.ingest.us.sentry.io/456`, where the
 * character after `@` is the org prefix. Every correctly configured deployment
 * read as unconfigured. Parsing the URL replaces guessing at its spelling, and
 * accepts self-hosted Sentry too.
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

/**
 * Whether *the environment* carries a usable DSN.
 *
 * Distinct from whether anything will actually transmit: that is
 * `hasActiveClient()`, and it is the one `captureException` reports on. A build
 * can have the env var set and still not report — the runtime config has to have
 * run. Keep the two questions apart; conflating them is how a monitoring setup
 * comes to be believed rather than known.
 */
export function isSentryConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return parseSentryDsn(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN) !== null;
}

/** An initialised client, with a DSN, not explicitly disabled — or `undefined`. */
function activeClient(): ReturnType<typeof Sentry.getClient> {
  const client = Sentry.getClient();
  if (!client) return undefined;
  if (!client.getDsn()) return undefined;
  if (client.getOptions().enabled === false) return undefined;
  return client;
}

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

/**
 * Builds the scrubbed tags and extras this app attaches to every event.
 *
 * Still exported, and still tested, because it is the definition of what a
 * Business Helper error report carries: the tenant, the user, the route and the
 * severity, with personal data removed. `captureException` feeds its output
 * straight to the SDK.
 */
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

/** How long to wait for the transport queue before reporting the flush as failed. */
const FLUSH_TIMEOUT_MS = 2000;

/**
 * Never rejects: the caller is always a `catch` block or an error boundary, and
 * an unreachable monitoring host must not become the error the user sees.
 */
function flush(): Promise<boolean> {
  return Sentry.flush(FLUSH_TIMEOUT_MS).catch(() => false);
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

  if (!activeClient()) {
    // Named for what it is. The prefix this replaced was `[SENTRY CAPTURE]`,
    // which reads as a capture having happened.
    console.error('[MONITOR NOT CONFIGURED — NOTHING TRANSMITTED]', payload.message, {
      route: payload.tags.route,
      org: payload.tags.organization_id,
      // Distinguishes "no DSN anywhere" from "DSN set, but this runtime never
      // ran its Sentry config" — different fixes, and previously indistinguishable.
      dsn_in_env: isSentryConfigured(env),
    });
    return { handled: true, dispatchedToSentry: false, payload };
  }

  Sentry.captureException(error, {
    level: context.level || 'error',
    tags: payload.tags,
    extra: payload.extra,
  });

  // Not awaited: every caller is synchronous, and blocking a `catch` block on a
  // network round trip to the monitoring host would make an outage there an
  // outage here. The promise is returned so a caller that *can* wait may.
  return { handled: true, dispatchedToSentry: true, delivery: flush(), payload };
}

export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' = 'info',
  context: ErrorContext = {},
  env: Record<string, string | undefined> = process.env
): CaptureResult {
  const scrubbed = scrubText(String(message));

  const tags = scrubTags({
    organization_id: context.organization_id || 'anonymous',
    route: context.route || 'unknown',
    severity: level,
    ...context.tags,
  });

  const payload = {
    message: scrubbed,
    level,
    timestamp: new Date().toISOString(),
    tags,
  };

  if (!activeClient()) {
    console.log(
      `[MONITOR NOT CONFIGURED — NOTHING TRANSMITTED:${level.toUpperCase()}]`,
      scrubbed,
      { dsn_in_env: isSentryConfigured(env) }
    );
    return { handled: true, dispatchedToSentry: false, payload };
  }

  Sentry.captureMessage(scrubbed, {
    level,
    tags,
    extra: scrubExtra(context.extra || {}),
  });

  return { handled: true, dispatchedToSentry: true, delivery: flush(), payload };
}

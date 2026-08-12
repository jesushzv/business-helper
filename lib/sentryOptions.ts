/**
 * Business Helper — the `Sentry.init()` options every runtime shares.
 *
 * Next.js initialises Sentry three times (browser, Node, Edge) from three files.
 * Anything that must hold everywhere — the scrubbers above all — belongs here,
 * because three hand-copied option objects drift, and the one that drifts is the
 * one that ships a CLABE.
 *
 * Every `process.env` read is a literal member expression on purpose: Next.js
 * inlines `process.env.NEXT_PUBLIC_*` into the client bundle only when it can see
 * the property name statically. A lookup through a variable silently becomes
 * `undefined` in the browser.
 */

import { scrubEvent, scrubLog, type ScrubbableLog } from '@/lib/sentryScrub';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Sampling: everything in development, a tenth in production.
 *
 * The skill's default, and the right one here — this is a solo-founder project
 * on a Sentry quota, and traces are the highest-volume event type by far.
 */
export const TRACES_SAMPLE_RATE = isProduction ? 0.1 : 1.0;

/** Profiling opts in once per page load / process start, not per span. */
export const PROFILE_SESSION_SAMPLE_RATE = isProduction ? 0.1 : 1.0;

/**
 * `VERCEL_ENV` distinguishes preview from production; `NODE_ENV` is `production`
 * for both, so on its own it would file preview noise against production.
 */
function resolveEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'
  );
}

/**
 * The commit the deployment was built from, so a stack trace resolves against
 * the right source maps. Vercel sets both spellings; the `NEXT_PUBLIC_` one is
 * the only one the browser bundle can see.
 */
function resolveRelease(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.SENTRY_RELEASE ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  );
}

/**
 * Errors that are noise in every app, dropped before they burn quota.
 * Deliberately short — a filter list is a place bugs go to hide.
 */
const IGNORED_ERRORS = [
  // The user navigated away mid-request. Not a defect.
  'AbortError',
  'The operation was aborted',
  // Browser extensions and injected scripts.
  /extension:\/\//,
  // A stale chunk after a deploy; the reload fixes it.
  'ChunkLoadError',
];

export interface BaseSentryOptions {
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
  enableLogs: boolean;
  sendDefaultPii: boolean;
  ignoreErrors: (string | RegExp)[];
  beforeSend: typeof scrubEvent;
  beforeSendLog: <T extends ScrubbableLog>(log: T) => T;
}

/**
 * Shared across browser, Node and Edge.
 *
 * **`sendDefaultPii` is `false`, deviating from the Sentry skill's suggested
 * `true`.** The skill is written for apps in general; this one holds RFCs,
 * CLABEs and client telephone numbers for Mexican SMBs, and #52 shipped with the
 * explicit criterion that none of those appear in a payload. `sendDefaultPii:
 * true` attaches IP addresses, request headers, cookies and user email by
 * default — it would re-open exactly what the scrubbers close, upstream of them.
 * The tenant and the code path still arrive, as the `organization_id`, `user_id`
 * and `route` tags that `scrubEvent` is written to preserve.
 */
export function baseSentryOptions(): BaseSentryOptions {
  return {
    environment: resolveEnvironment(),
    release: resolveRelease(),
    tracesSampleRate: TRACES_SAMPLE_RATE,
    enableLogs: true,
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERRORS,
    beforeSend: scrubEvent,
    beforeSendLog: scrubLog,
  };
}

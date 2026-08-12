/**
 * Sentry — Node.js server runtime.
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`.
 */

import * as Sentry from '@sentry/nextjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { baseSentryOptions, PROFILE_SESSION_SAMPLE_RATE } from '@/lib/sentryOptions';

Sentry.init({
  ...baseSentryOptions(),

  // `SENTRY_DSN` is the server variable; falling back to the public one means a
  // deployment that only ever set the `NEXT_PUBLIC_` spelling still reports.
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [
    // V8 CpuProfiler, a native add-on. Node only — see `sentry.edge.config.ts`.
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],

  /**
   * Attaches the locals in scope at the throw site to each stack frame.
   *
   * This is the option with the sharpest PII edge in the whole setup: on a route
   * that just read a client row, the row is a local. It is on because a 500 with
   * the offending values attached is worth far more than one without, and
   * `scrubEvent` scrubs `frame.vars` through the same filter as `extra` — keyed
   * PII dropped, nested objects reduced to `[object omitted]`.
   */
  includeLocalVariables: true,

  profileSessionSampleRate: PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: 'trace',
});

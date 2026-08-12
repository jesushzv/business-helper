/**
 * Sentry — browser runtime.
 *
 * Next.js loads this file itself for the client bundle; there is no import of it
 * anywhere. (Older Sentry docs call this `sentry.client.config.ts`.)
 */

import * as Sentry from '@sentry/nextjs';
import { baseSentryOptions, PROFILE_SESSION_SAMPLE_RATE } from '@/lib/sentryOptions';

Sentry.init({
  ...baseSentryOptions(),

  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [
    Sentry.browserTracingIntegration(),
    // Order matters: profiling attaches to the spans tracing creates, so it has
    // to be registered after it.
    Sentry.browserProfilingIntegration(),

    /**
     * Session Replay, with every privacy control left at its most restrictive.
     *
     * These four are already the SDK defaults. They are written out anyway
     * because this app records the *tenant's own clients* — `/q/[token]` and
     * `/pay/[token]` are used by the person signing a quote or paying an
     * invoice, and a future edit that relaxes masking "to see what the user
     * typed" needs to be a visible line in a diff, not a deleted default.
     *
     * Masked here: RFCs, CLABEs, telephone numbers, client names, MXN amounts.
     * A replay shows the shape of the session and where it broke, not its data.
     */
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
      // Request/response bodies are off by default; naming it keeps it off.
      networkDetailAllowUrls: [],
    }),

    // `console.warn` / `console.error` become structured logs. `lib/dbWriteError.ts`
    // and the API routes already write their diagnostics there.
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],

  // 10% of sessions, and every session that hit an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  profileSessionSampleRate: PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: 'trace',
});

/** App Router navigation spans. Next.js calls this on every route transition. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

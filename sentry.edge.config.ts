/**
 * Sentry — Edge runtime (middleware, edge route handlers).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'edge'`.
 *
 * Deliberately thinner than the Node config: the Edge runtime supports neither
 * native add-ons (so no `nodeProfilingIntegration`) nor the V8 inspector hooks
 * behind `includeLocalVariables`. Adding either here fails at build or silently
 * at runtime.
 */

import * as Sentry from '@sentry/nextjs';
import { baseSentryOptions } from '@/lib/sentryOptions';

Sentry.init({
  ...baseSentryOptions(),

  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
});

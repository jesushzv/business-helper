/**
 * Next.js server-side registration hook.
 *
 * Runs once per server runtime, before any request is handled. Stable since
 * Next.js 14.0.4, so no `experimental.instrumentationHook` flag is needed on 15.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Captures every unhandled server-side request error — Server Components,
 * route handlers, middleware — without a `captureException` call at each site.
 *
 * This is the half of error monitoring the previous raw-REST module could not
 * reach: it only ever saw errors someone had remembered to hand to it.
 */
export const onRequestError = Sentry.captureRequestError;

'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { setBrowserDistinctIdSource } from '@/lib/analytics';

/**
 * Browser-side PostHog SDK, mounted once from the root layout.
 *
 * Two constraints shape this file:
 *
 * 1. **Analytics may never break the product** (`lib/analytics.ts` rule 1).
 *    Nothing here throws — a missing key warns in development and is silent
 *    everywhere else. A module-scope `throw` would take the root layout, and
 *    therefore every page, down with it.
 * 2. **Initialization is browser-only.** `'use client'` modules still execute
 *    during server prerender, so `posthog.init` runs from an effect rather than
 *    at import time.
 */

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Same default as `lib/analytics.ts`, so one env var is enough to go live. */
function apiHost(): string {
  return (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
}

let initialized = false;

function initPostHog(): void {
  if (initialized || typeof window === 'undefined') return;

  if (!projectToken) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[analytics] NEXT_PUBLIC_POSTHOG_KEY is unset — PostHog is disabled and events are dropped. Set it to enable analytics.'
      );
    }
    return;
  }

  try {
    posthog.init(projectToken, {
      api_host: apiHost(),
      defaults: '2025-05-24',
      capture_exceptions: true,
      debug: process.env.NODE_ENV === 'development',
    });
    initialized = true;

    // From here the raw capture path in lib/analytics.ts borrows this identity
    // instead of minting its own, so both senders agree on who the person is.
    setBrowserDistinctIdSource(() => {
      try {
        return posthog.get_distinct_id();
      } catch {
        return null;
      }
    });
  } catch {
    // Rule 1: a broken SDK is never worth a broken page.
  }
}

export function identifyPostHogUser(
  userId: string,
  properties: { email?: string; name?: string }
): void {
  if (!initialized) return;
  try {
    posthog.identify(userId, properties);
  } catch {
    // Rule 1.
  }
}

export function resetPostHogUser(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // Rule 1.
  }
}

export function capturePostHogException(
  error: Error,
  properties: { route: string; level: string }
): void {
  if (!initialized) return;
  try {
    posthog.captureException(error, properties);
  } catch {
    // Rule 1.
  }
}

export function PostHogInit() {
  useEffect(() => {
    initPostHog();
  }, []);

  return null;
}

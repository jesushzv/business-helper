'use client';

import type { ProductEvent } from './analytics';

/**
 * Browser side of product analytics.
 *
 * Nothing here talks to PostHog. The browser posts to `/api/analytics/event`,
 * which validates the event name, resolves who the caller is from the session
 * cookie and forwards it. That keeps the project key server-side, keeps a
 * third-party script out of the bundle, and means an ad blocker does not
 * silently delete the top of the funnel.
 *
 * **Consent.** The cookie notice offers "Aceptar Todo" and "Solo Esenciales",
 * and describes essential cookies plus *anonymous* navigation analytics. This
 * module honours that distinction literally: with full consent the anonymous id
 * is persisted in `localStorage`, so a visitor who comes back tomorrow is the
 * same person in the funnel; with essential-only consent the id lives in memory
 * for the current page only and nothing is stored on the device. Events are
 * recorded either way — that is the anonymous analytics the notice declares —
 * but only one of the two cases creates a persistent identifier.
 */

const CONSENT_STORAGE_KEY = 'bh_cookie_consent';
const ANONYMOUS_ID_STORAGE_KEY = 'bh_anon_id';

/** Used when consent is essential-only: never written to the device. */
let ephemeralId: string | null = null;

export function hasFullCookieConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'all';
  } catch {
    // Private mode, or storage disabled. Treat as essential-only.
    return false;
  }
}

function mintId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the arithmetic id below.
  }
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The id that identifies this visitor before they have an account.
 *
 * Once they do, `/api/analytics/event` aliases it onto their user id, so the
 * funnel runs from the landing page through to a confirmed payment as one
 * person.
 */
export function getAnalyticsDistinctId(): string {
  if (!hasFullCookieConsent()) {
    if (!ephemeralId) ephemeralId = mintId();
    return ephemeralId;
  }

  try {
    const stored = localStorage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (stored) return stored;
    const minted = mintId();
    localStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, minted);
    return minted;
  } catch {
    if (!ephemeralId) ephemeralId = mintId();
    return ephemeralId;
  }
}

/**
 * Records a product event from the browser. Never throws.
 *
 * Deliberately not awaited at call sites: a click that opens WhatsApp must not
 * wait on instrumentation. `keepalive` lets the request survive the navigation
 * that usually follows.
 */
export function trackClientEvent(event: ProductEvent, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  try {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        anonymousId: getAnalyticsDistinctId(),
        properties: properties || {},
      }),
      keepalive: true,
    }).catch(() => {
      // An analytics endpoint that is down is not the user's problem.
    });
  } catch {
    // Ditto for a browser that refuses the request outright.
  }
}

/** Test seam: forgets the in-memory id so each case starts from a clean visitor. */
export function resetEphemeralAnalyticsId(): void {
  ephemeralId = null;
}

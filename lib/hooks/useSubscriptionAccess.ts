'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import {
  evaluateSubscriptionAccess,
  type SubscriptionAccess,
} from '@/lib/subscriptionAccess';

/**
 * What this organization may do, for the UI (#128).
 *
 * `requireActiveSubscription()` in `lib/apiAuth.ts` is the enforcement; this
 * exists so a tenant sees the trial ending before they lose a half-typed quote
 * to a 402, and so the "Nueva Cotización" button can say why it is disabled.
 *
 * **`access` is a tri-state, not a boolean**, and the third state is the point
 * (#64, #96):
 *
 *   - a `SubscriptionAccess` object — the server answered and this is its state.
 *   - `null` — unknown: still loading, or the read failed. Nothing is claimed
 *     and **nothing is blocked**. Telling a tenant "tu prueba terminó" because
 *     one request timed out is inventing a fact, and the fact it invents is one
 *     that stops them working. The server refuses independently, so being
 *     permissive here cannot let an expired tenant actually create anything.
 *
 * Callers should read `canWrite` through {@link subscriptionAllowsWrite}, which
 * makes the permissive-on-unknown choice explicit at every call site rather
 * than leaving it to `access?.canWrite` — which is `undefined`, and falsy, and
 * would silently disable the whole UI on a network blip.
 *
 * Demo mode reports full access: the marketing demo has no tenant and no
 * billing, and a trial banner over it would be fiction. Gated on
 * `isClientDemoMode()` — the build-time signal — never on a 503, since
 * collection GETs answer the demo deployment with 200 and an empty list.
 */
export interface SubscriptionAccessState {
  /** The server's answer, or null for unknown. See the note above. */
  access: SubscriptionAccess | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Whether the UI should permit a write, given a possibly-unknown access state.
 *
 * `null` (unknown) means **yes**. This is the one place that decision is made,
 * so a call site cannot accidentally invert it by writing `access?.canWrite`.
 */
export function subscriptionAllowsWrite(access: SubscriptionAccess | null): boolean {
  return access === null ? true : access.canWrite;
}

export function useSubscriptionAccess(): SubscriptionAccessState {
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (isClientDemoMode()) {
      setAccess({
        state: 'active',
        canWrite: true,
        trialDaysRemaining: null,
        message: null,
      });
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch('/api/organization')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !data?.organization) {
          // Unknown, not expired. See the tri-state note above.
          setAccess(null);
          return;
        }

        setAccess(
          evaluateSubscriptionAccess({
            status: data.organization.subscription_status,
            trialEndsAt: data.organization.trial_ends_at,
            now: new Date(),
          })
        );
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { access, loading, refresh };
}

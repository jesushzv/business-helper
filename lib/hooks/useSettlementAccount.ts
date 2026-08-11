'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { hasSettlementAccount } from '@/lib/settlementAccount';
import type { UserRole } from '@/lib/teamRBAC';

/**
 * Whether this organization can receive money yet (#64).
 *
 * Drives the dashboard banner and the disabled share actions. The server gate
 * in `lib/settlementAccount.ts` is the enforcement; this exists so the tenant
 * finds out before they try, rather than after a client opens a dead link.
 *
 * Three states, deliberately distinct — `ready` is a tri-state, not a boolean:
 *
 *   - `true`  — the organization has an 18-digit CLABE.
 *   - `false` — the server said it does not. Only this state warns or disables.
 *   - `null`  — unknown: still loading, or the read failed. Nothing is claimed
 *               and nothing is blocked. Asserting "you have no bank account" on
 *               the strength of a failed request would be inventing a fact, and
 *               disabling on it would break the page over a network blip. The
 *               server gate still refuses, so being permissive here cannot let
 *               a payment link out.
 *
 * Demo mode reports `true`: the marketing demo has no tenant and no real money
 * path, and a permanent red banner across it would be noise rather than truth.
 * It is gated on `isClientDemoMode()` (the build-time signal), never on a 503 —
 * collection GETs answer the demo deployment with 200 and an empty list.
 */
export interface SettlementAccountState {
  /** True / false / unknown — see the note above before treating this as a boolean. */
  ready: boolean | null;
  loading: boolean;
  /** The caller's role, so the banner can address the person who can act. */
  role: UserRole | null;
  /** Only an owner can save the account: the PATCH is scoped by `owner_id`. */
  canFix: boolean;
  refresh: () => void;
}

/**
 * Subscribers to "this organization's settlement account just changed".
 *
 * The banner lives in the dashboard shell and the share actions live on
 * Cobranza and Facturación, none of which remount on a client-side navigation
 * — so a tenant who removed their account in Ajustes kept a stale `ready: true`
 * for the rest of the session and could still hand a client a `/pay/` link that
 * answers 409. That is the exact failure #64 exists to move off the client's
 * screen, so the write path announces the change and every mounted reader
 * refetches (#163).
 */
const settlementAccountListeners = new Set<() => void>();

/** Called by whatever writes the account, after the server confirms the write. */
export function notifySettlementAccountChanged(): void {
  settlementAccountListeners.forEach((listener) => listener());
}

export function useSettlementAccount(): SettlementAccountState {
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    settlementAccountListeners.add(refresh);
    return () => {
      settlementAccountListeners.delete(refresh);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    if (isClientDemoMode()) {
      setReady(true);
      setRole('owner');
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch('/api/organization')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !data?.organization) {
          // Unknown, not "missing". See the tri-state note above.
          setReady(null);
          setRole(null);
          return;
        }

        setReady(hasSettlementAccount(data.organization));
        setRole((data.role as UserRole) || null);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(null);
          setRole(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { ready, loading, role, canFix: role === 'owner', refresh };
}

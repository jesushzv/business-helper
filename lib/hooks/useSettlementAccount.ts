'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { hasSettlementAccount } from '@/lib/settlementAccount';
import type { BankAccount } from '@/lib/bankAccounts';
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

/**
 * Called by whatever writes the account, **after** the server confirms it.
 *
 * Not during a render: this calls `setState` on every mounted subscriber, so a
 * caller inside a render body would warn and could loop. Both call sites today
 * are inside event handlers, past an `await`.
 */
export function notifySettlementAccountChanged(): void {
  settlementAccountListeners.forEach((listener) => listener());
}

/**
 * How many hooks are currently subscribed. Exported for tests only.
 *
 * The unsubscription cannot be observed through behaviour: `refresh` on an
 * unmounted component is a no-op React swallows, so a test that leaves a
 * listener behind and asserts "no refetch happened" passes either way — it
 * measures React's no-op, not the cleanup. The leak it means to catch is this
 * set growing a dead closure (and its retained fiber) on every visit to
 * Ajustes, which is only visible by counting.
 */
export function settlementAccountListenerCount(): number {
  return settlementAccountListeners.size;
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

    // The account list, not the organization row: since #164 readiness means
    // "has at least one account that is not archived", which one column on
    // `organizations` cannot answer for a tenant keeping two banks.
    fetch('/api/organization/bank-accounts')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !Array.isArray(data?.accounts)) {
          // Unknown, not "missing". See the tri-state note above.
          setReady(null);
          setRole(null);
          return;
        }

        setReady(hasSettlementAccount(data.accounts as BankAccount[]));
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

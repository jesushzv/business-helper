'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, Lock } from 'lucide-react';
import { useSubscriptionAccess } from '@/lib/hooks/useSubscriptionAccess';

/**
 * The trial countdown, and the wall at the end of it (#128).
 *
 * Sits beside `SettlementAccountBanner` in the app shell and follows its rules:
 * never dismissable, and it says nothing at all unless the server said
 * something. `useSubscriptionAccess` returns `null` for unknown — a failed read
 * or a request still in flight — and this renders nothing in that case, because
 * "tu prueba terminó" is a claim, and claiming it off a network blip would stop
 * a paying tenant from working.
 *
 * It is also silent for most of the trial. `evaluateSubscriptionAccess` only
 * produces a message in the last seven days; a countdown from day 30 is nagging,
 * not information, and a banner a tenant learns to scroll past is worse than no
 * banner when the real one arrives.
 *
 * Two visual registers, because they are two different facts:
 *
 *   - amber, a clock — time is running out, everything still works;
 *   - rose, a lock — writes are refused now, reads and collections are not.
 *
 * The copy names what still works in the blocked state on purpose. A tenant
 * whose trial lapsed has signed contracts and money owed to them, and their
 * first fear is that it has become unreachable. It has not, and saying so is
 * the difference between a paywall and an eviction notice.
 */
export const TrialStatusBanner: React.FC = () => {
  const { access, loading } = useSubscriptionAccess();

  if (loading || !access || !access.message) return null;

  const blocked = !access.canWrite;

  return (
    <div
      role="alert"
      className={
        blocked
          ? 'border-b border-rose-500/30 bg-rose-950/80 px-4 py-3 sm:px-6'
          : 'border-b border-amber-500/30 bg-amber-950/80 px-4 py-3 sm:px-6'
      }
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {blocked ? (
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          )}
          <div>
            <p
              className={
                blocked
                  ? 'text-sm font-black text-rose-200'
                  : 'text-sm font-black text-amber-200'
              }
            >
              {blocked ? 'Tu prueba gratis terminó' : 'Tu prueba gratis está por terminar'}
            </p>
            <p
              className={
                blocked
                  ? 'mt-0.5 text-xs font-medium text-rose-100/80'
                  : 'mt-0.5 text-xs font-medium text-amber-100/80'
              }
            >
              {access.message}
            </p>
          </div>
        </div>

        <Link
          href="/settings?tab=plan"
          className={
            blocked
              ? 'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-rose-500 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-rose-400'
              : 'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400'
          }
        >
          Ver planes
        </Link>
      </div>
    </div>
  );
};

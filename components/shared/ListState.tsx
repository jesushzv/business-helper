'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ListStateProps {
  loading: boolean;
  error: string | null;
  /** Whether the (filtered) list has zero rows — consulted only after loading and error. */
  isEmpty: boolean;
  /** Icon for the error card: the page's domain icon (Users / Clock / Wallet). */
  icon: LucideIcon;
  /** 'No pudimos cargar tu directorio' / '…tus cotizaciones' / '…tu cobranza'. */
  errorTitle: string;
  /** Grid wrapper for the loading skeleton; pages differ only in margins/gaps. */
  skeletonClassName?: string;
  /** Extra classes on the error card wrapper (e.g. 'mt-12'). */
  errorClassName?: string;
  /** The page's own empty state — CTA and copy are page-specific (#104). */
  empty: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The list read-path scaffold: loading skeleton → error card → empty → rows.
 *
 * Three states, not two (#97/#260): a failed read must render as a failure,
 * never as a reassuring empty state — "todas tus cuentas están al día" or a
 * create-your-first CTA are factual claims the page cannot back while holding
 * an error. This component makes the ordering structural instead of re-argued
 * in comments on every page; `tests/components/readPathErrorStates.test.tsx`
 * pins the behavior per page and `ListState.test.tsx` pins it here.
 */
export function ListState({
  loading,
  error,
  isEmpty,
  icon: Icon,
  errorTitle,
  skeletonClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5',
  errorClassName = '',
  empty,
  children,
}: ListStateProps) {
  if (loading) {
    return (
      <div className={skeletonClassName}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-800/80" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className={`rounded-3xl border border-rose-500/30 bg-rose-950/60 p-12 text-center space-y-3 ${errorClassName}`.trim()}
      >
        <Icon className="mx-auto h-12 w-12 text-rose-400" />
        <h3 className="text-lg font-bold text-white">{errorTitle}</h3>
        <p className="mx-auto max-w-sm text-sm text-rose-200">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[48px] rounded-2xl bg-slate-800 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-slate-700 active:scale-95"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (isEmpty) {
    return <>{empty}</>;
  }

  return <>{children}</>;
}

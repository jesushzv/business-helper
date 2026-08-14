import React from 'react';
import { Header } from '@/components/layout/Header';

interface DashboardPageShellProps {
  /**
   * Title for the sticky Header bar. Omit when the bar title would just
   * repeat the h1 below it — the catálogo page's deliberate choice, pinned by
   * tests/unit/flowPolish.test.ts ("printing its own title twice").
   */
  headerTitle?: string;
  /** The page's h1. */
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

/**
 * The single-card dashboard page frame (Header + h1 + subtitle + content) —
 * assistant, invoices, products and team were four copies of these 16 lines.
 * Server component: no state, so client pages can also render it.
 */
export function DashboardPageShell({ headerTitle, title, subtitle, children }: DashboardPageShellProps) {
  return (
    <>
      <Header title={headerTitle} />
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{title}</h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">{subtitle}</p>
        </div>

        {children}
      </div>
    </>
  );
}

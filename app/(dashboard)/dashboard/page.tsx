'use client';

import React from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { DollarSign, Plus } from 'lucide-react';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { greetingFirstName } from '@/lib/greeting';
import { FinancialOverviewCards } from '@/components/dashboard/FinancialOverviewCards';
import { CashFlowForecastCard } from '@/components/dashboard/CashFlowForecastCard';
import { TopClientsCard } from '@/components/dashboard/TopClientsCard';

export default function DashboardPage() {
  const { metrics, topClients, cashFlowForecast, loading, error } = useDashboardAnalytics();
  const { org, user } = useCurrentOrg();

  // Greet whoever we actually know — first name, business name, or nobody.
  // "¡Hola, Don Roberto!" used to greet every real owner (#93). First name
  // honorific-aware: splitting on the first word alone greeted "¡Hola, Don!".
  const greetName = greetingFirstName(user?.name) || org?.name || null;

  return (
    <div className="min-h-screen pb-16">
      <Header title="Centro de Control" />

      <div className="px-4 py-6 md:px-8 space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-linear-to-r from-slate-900 via-slate-900 to-emerald-950/60 p-6 text-white shadow-2xl sm:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <span className="rounded-full bg-emerald-950 px-3.5 py-1 text-xs font-extrabold tracking-wide text-emerald-400 border border-emerald-500/30 uppercase">
                Panel de Administración
              </span>
              <h2 className="mt-2.5 text-2xl font-black tracking-tight sm:text-3xl text-white">
                {greetName ? `¡Hola, ${greetName}!` : '¡Hola!'}
              </h2>
              <p className="mt-1 max-w-xl text-xs font-medium text-slate-300 sm:text-sm">
                Resumen ejecutivo de ingresos, cuentas por cobrar, flujo de efectivo y clientes clave.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/quotes?nueva=1"
                className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-950/60 transition-all hover:bg-emerald-400 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Cotización</span>
              </Link>

              <Link
                href="/receivables"
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-sm font-bold text-slate-200 shadow-sm hover:bg-slate-700 hover:text-white active:scale-95"
              >
                <DollarSign className="h-4 w-4 text-emerald-400" />
                <span>Ver Cobranza</span>
              </Link>
            </div>
          </div>
        </div>

        {/* A failed read renders as a warning, never as silently-wrong KPIs:
            "$0 por cobrar" computed from an errored fetch is a false claim
            about money (#97). */}
        {!loading && error && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/60 p-4 text-sm font-medium text-amber-200">
            <span>{error} Los números pueden estar incompletos.</span>
          </div>
        )}

        {/* Real-time Executive Financial KPI Cards */}
        {loading ? (
          <div className="h-32 w-full animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        ) : (
          <FinancialOverviewCards metrics={metrics} />
        )}

        {/* Cash Flow Forecast (30/60/90 Days) */}
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        ) : (
          <CashFlowForecastCard forecast={cashFlowForecast} />
        )}

        {/* Top Clients by Revenue Leaderboard */}
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        ) : (
          <TopClientsCard topClients={topClients} />
        )}
      </div>
    </div>
  );
}

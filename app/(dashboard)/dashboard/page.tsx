'use client';

import React from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Users, FileText, DollarSign, Plus } from 'lucide-react';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import { FinancialOverviewCards } from '@/components/dashboard/FinancialOverviewCards';
import { CashFlowForecastCard } from '@/components/dashboard/CashFlowForecastCard';
import { TopClientsCard } from '@/components/dashboard/TopClientsCard';

export default function DashboardPage() {
  const { metrics, topClients, cashFlowForecast, loading } = useDashboardAnalytics();

  return (
    <div className="min-h-screen pb-16">
      <Header title="Centro de Control" />

      <div className="px-4 py-6 md:px-8 space-y-8">
        {/* Welcome Banner */}
        <div className="rounded-3xl bg-linear-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <span className="rounded-full bg-indigo-700/60 px-3 py-1 text-xs font-bold tracking-wide uppercase">
                Panel de Administración
              </span>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                ¡Hola, Don Roberto!
              </h2>
              <p className="mt-1 max-w-xl text-xs font-medium text-indigo-200 sm:text-sm">
                Resumen ejecutivo de ingresos, cuentas por cobrar, flujo de efectivo y clientes clave.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/quotes"
                className="flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-950 shadow-md transition-all hover:bg-indigo-50 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Cotización</span>
              </Link>

              <Link
                href="/receivables"
                className="flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-700/80 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-600 active:scale-95"
              >
                <DollarSign className="h-4 w-4" />
                <span>Ver Cobranza</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Real-time Executive Financial KPI Cards */}
        {loading ? (
          <div className="h-32 w-full animate-pulse rounded-3xl bg-gray-100" />
        ) : (
          <FinancialOverviewCards metrics={metrics} />
        )}

        {/* Cash Flow Forecast (30/60/90 Days) */}
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-gray-100" />
        ) : (
          <CashFlowForecastCard forecast={cashFlowForecast} />
        )}

        {/* Top Clients by Revenue Leaderboard */}
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-gray-100" />
        ) : (
          <TopClientsCard topClients={topClients} />
        )}
      </div>
    </div>
  );
}

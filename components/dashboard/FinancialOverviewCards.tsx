'use client';

import React from 'react';
import Link from 'next/link';
import { DollarSign, TrendingUp, AlertTriangle, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { BusinessMetrics } from '@/lib/dashboardAnalytics';

interface FinancialOverviewCardsProps {
  metrics: BusinessMetrics;
}

export const FinancialOverviewCards: React.FC<FinancialOverviewCardsProps> = ({ metrics }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(val);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1. Cobrado (Collected Revenue) */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-linear-to-br from-emerald-50/50 via-white to-emerald-50/20 p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-wider text-emerald-800 uppercase">
            Ingresos Cobrados
          </span>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-xs">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">
          {formatCurrency(metrics.collectedRevenue)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-emerald-100/60 pt-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Cobranza confirmada</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
            En cuenta
          </span>
        </div>
      </div>

      {/* 2. Por Cobrar (Pending Receivables) */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-100 bg-linear-to-br from-amber-50/50 via-white to-amber-50/20 p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-wider text-amber-800 uppercase">
            Por Cobrar (Pendiente)
          </span>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">
          {formatCurrency(metrics.pendingReceivables)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-amber-100/60 pt-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-700">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <span>{metrics.totalMilestonesCount} hitos registrados</span>
          </div>
          <Link
            href="/receivables"
            className="flex min-h-[48px] items-center gap-1 font-bold text-amber-700 hover:text-amber-900"
          >
            <span>Ver detalle</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 3. Deuda Atrasada (Overdue Debt) */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 shadow-xs ${
        metrics.overdueDebt > 0
          ? 'border-red-100 bg-linear-to-br from-red-50/50 via-white to-red-50/20'
          : 'border-gray-200 bg-white'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-extrabold tracking-wider uppercase ${
            metrics.overdueDebt > 0 ? 'text-red-800' : 'text-gray-500'
          }`}>
            Deuda Vencida (Atrasada)
          </span>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-xs ${
            metrics.overdueDebt > 0 ? 'bg-red-500' : 'bg-gray-400'
          }`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
        <p className={`mt-3 text-3xl font-black tracking-tight sm:text-4xl ${
          metrics.overdueDebt > 0 ? 'text-red-600' : 'text-gray-900'
        }`}>
          {formatCurrency(metrics.overdueDebt)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
          <div className={`flex items-center gap-1.5 font-semibold ${
            metrics.overdueDebt > 0 ? 'text-red-700' : 'text-emerald-700'
          }`}>
            {metrics.overdueDebt > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span>Requiere recordatorio</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Sin cartera vencida</span>
              </>
            )}
          </div>
          {metrics.overdueDebt > 0 && (
            <Link
              href="/receivables?filter=overdue"
              className="flex min-h-[48px] items-center gap-1 font-bold text-red-700 hover:text-red-900"
            >
              <span>Cobrar hoy</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

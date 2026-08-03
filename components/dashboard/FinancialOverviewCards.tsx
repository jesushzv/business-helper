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
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-linear-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-6 shadow-xl shadow-emerald-950/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-wider text-emerald-400 uppercase">
            Ingresos Cobrados
          </span>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-slate-950 shadow-md font-bold">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-3 font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
          {formatCurrency(metrics.collectedRevenue)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Cobranza confirmada</span>
          </div>
          <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 font-bold text-emerald-400 border border-emerald-500/30">
            En cuenta
          </span>
        </div>
      </div>

      {/* 2. Por Cobrar (Pending Receivables) */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-linear-to-br from-slate-900 via-slate-900 to-amber-950/30 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-wider text-amber-400 uppercase">
            Por Cobrar (Pendiente)
          </span>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-slate-950 shadow-md font-bold">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-3 font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">
          {formatCurrency(metrics.pendingReceivables)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            <span>{metrics.totalMilestonesCount} hitos registrados</span>
          </div>
          <Link
            href="/receivables"
            className="flex min-h-[48px] items-center gap-1 font-bold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <span>Ver detalle</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 3. Deuda Atrasada (Overdue Debt) */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 shadow-xl ${
        metrics.overdueDebt > 0
          ? 'border-rose-500/40 bg-linear-to-br from-slate-900 via-slate-900 to-rose-950/40'
          : 'border-slate-800 bg-slate-900'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-extrabold tracking-wider uppercase ${
            metrics.overdueDebt > 0 ? 'text-rose-400' : 'text-slate-400'
          }`}>
            Deuda Vencida (Atrasada)
          </span>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl font-bold shadow-md ${
            metrics.overdueDebt > 0 ? 'bg-rose-500 text-slate-950' : 'bg-slate-800 text-slate-400'
          }`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
        <p className={`mt-3 font-mono text-3xl font-black tracking-tight sm:text-4xl ${
          metrics.overdueDebt > 0 ? 'text-rose-400' : 'text-white'
        }`}>
          {formatCurrency(metrics.overdueDebt)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <div className={`flex items-center gap-1.5 font-semibold ${
            metrics.overdueDebt > 0 ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {metrics.overdueDebt > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span>Requiere recordatorio</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Sin cartera vencida</span>
              </>
            )}
          </div>
          {metrics.overdueDebt > 0 && (
            <Link
              href="/receivables?filter=overdue"
              className="flex min-h-[48px] items-center gap-1 font-bold text-rose-400 hover:text-rose-300 transition-colors"
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

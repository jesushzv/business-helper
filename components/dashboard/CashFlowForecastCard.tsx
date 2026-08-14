'use client';

import React from 'react';
import { Calendar, TrendingUp, ShieldAlert, CheckCircle } from 'lucide-react';
import { CashFlowForecast } from '@/lib/dashboardAnalytics';
import { formatMXN } from '@/lib/currencyFormat';

interface CashFlowForecastCardProps {
  forecast: CashFlowForecast;
}

export const CashFlowForecastCard: React.FC<CashFlowForecastCardProps> = ({ forecast }) => {
  const buckets = [
    { ...forecast.days30, color: 'bg-emerald-500', bgDark: 'bg-slate-950/60 text-slate-100 border-emerald-500/30' },
    { ...forecast.days60, color: 'bg-teal-400', bgDark: 'bg-slate-950/60 text-slate-100 border-teal-500/30' },
    { ...forecast.days90, color: 'bg-indigo-400', bgDark: 'bg-slate-950/60 text-slate-100 border-indigo-500/30' },
  ];

  const maxAmount = Math.max(...buckets.map((b) => b.amount), 1);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
      <div className="flex flex-col justify-between gap-2 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Calendar className="h-4 w-4" />
            </div>
            <h3 className="text-xl font-extrabold tracking-tight text-white">
              Proyección de Flujo de Efectivo
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Pronóstico de entradas de dinero a 30, 60 y 90 días basado en fechas de vencimiento de hitos.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-bold text-emerald-400 border border-emerald-500/30">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span>Total Proyectado: {formatMXN(forecast.totalForecast)}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {buckets.map((bucket, idx) => {
          const percentage = Math.round((bucket.amount / maxAmount) * 100);
          return (
            <div
              key={idx}
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all hover:border-slate-700 ${bucket.bgDark}`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span>{bucket.periodLabel}</span>
                  <span>{bucket.daysRange}</span>
                </div>

                <p className="mt-3 font-mono text-2xl font-black tracking-tight text-white">
                  {formatMXN(bucket.amount)}
                </p>

                <p className="mt-1 text-xs font-medium text-slate-400">
                  {bucket.count === 1 ? '1 hito por cobrar' : `${bucket.count} hitos por cobrar`}
                </p>
              </div>

              {/* Progress Bar Visualization */}
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${bucket.color}`}
                    style={{ width: `${Math.max(percentage, 5)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-2 rounded-2xl bg-slate-950/80 p-4 text-xs font-medium text-slate-400 sm:flex-row border border-slate-800">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span>Monitoreo automático de liquidez de negocio en tiempo real.</span>
        </div>
        <div className="flex items-center gap-1 font-bold text-slate-300">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          <span>Excluye montos ya cobrados o vencidos.</span>
        </div>
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import { Calendar, TrendingUp, ShieldAlert, CheckCircle } from 'lucide-react';
import { CashFlowForecast } from '@/lib/dashboardAnalytics';

interface CashFlowForecastCardProps {
  forecast: CashFlowForecast;
}

export const CashFlowForecastCard: React.FC<CashFlowForecastCardProps> = ({ forecast }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(val);
  };

  const buckets = [
    { ...forecast.days30, color: 'bg-emerald-500', bgLight: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { ...forecast.days60, color: 'bg-indigo-500', bgLight: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    { ...forecast.days90, color: 'bg-purple-500', bgLight: 'bg-purple-50 text-purple-800 border-purple-200' },
  ];

  const maxAmount = Math.max(...buckets.map((b) => b.amount), 1);

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex flex-col justify-between gap-2 border-b border-gray-100 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Calendar className="h-4 w-4" />
            </div>
            <h3 className="text-xl font-extrabold tracking-tight text-gray-900">
              Proyección de Flujo de Efectivo
            </h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Pronóstico de entradas de dinero a 30, 60 y 90 días basado en fechas de vencimiento de hitos.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-900 border border-indigo-100">
          <TrendingUp className="h-4 w-4 text-indigo-600" />
          <span>Total Proyectado: {formatCurrency(forecast.totalForecast)}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {buckets.map((bucket, idx) => {
          const percentage = Math.round((bucket.amount / maxAmount) * 100);
          return (
            <div
              key={idx}
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all hover:shadow-md ${bucket.bgLight}`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider opacity-80">
                  <span>{bucket.periodLabel}</span>
                  <span>{bucket.daysRange}</span>
                </div>

                <p className="mt-3 text-2xl font-black tracking-tight text-gray-900">
                  {formatCurrency(bucket.amount)}
                </p>

                <p className="mt-1 text-xs font-medium text-gray-600">
                  {bucket.count === 1 ? '1 hito por cobrar' : `${bucket.count} hitos por cobrar`}
                </p>
              </div>

              {/* Progress Bar Visualization */}
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
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

      <div className="mt-6 flex flex-col items-center justify-between gap-2 rounded-2xl bg-gray-50 p-4 text-xs font-medium text-gray-600 sm:flex-row border border-gray-100">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>Monitoreo automático de liquidez de negocio en tiempo real.</span>
        </div>
        <div className="flex items-center gap-1 font-bold text-gray-700">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <span>Excluye montos ya cobrados o vencidos.</span>
        </div>
      </div>
    </div>
  );
};

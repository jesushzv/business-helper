'use client';

import React from 'react';
import { ReceivablesSummary } from '@/lib/receivablesCalculator';
import { AlertCircle, Clock, Calendar, CheckCircle2 } from 'lucide-react';

interface ReceivablesSummaryCardsProps {
  summary: ReceivablesSummary;
}

export const ReceivablesSummaryCards: React.FC<ReceivablesSummaryCardsProps> = ({ summary }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Overdue Card */}
      <div className="bg-white rounded-2xl p-5 border border-red-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">Atrasado</span>
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-black text-red-600 tracking-tight">
          {formatCurrency(summary.totalOverdue)}
        </div>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          {summary.countOverdue} {summary.countOverdue === 1 ? 'pago vencido' : 'pagos vencidos'}
        </p>
      </div>

      {/* Due Today Card */}
      <div className="bg-white rounded-2xl p-5 border border-amber-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Vence Hoy</span>
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-black text-amber-600 tracking-tight">
          {formatCurrency(summary.totalDueToday)}
        </div>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          {summary.countDueToday} {summary.countDueToday === 1 ? 'pago hoy' : 'pagos hoy'}
        </p>
      </div>

      {/* Upcoming Card */}
      <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Por Vencer</span>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-black text-indigo-600 tracking-tight">
          {formatCurrency(summary.totalUpcoming)}
        </div>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          {summary.countUpcoming} {summary.countUpcoming === 1 ? 'pago próximo' : 'pagos próximos'}
        </p>
      </div>

      {/* Confirmed Collected Card */}
      <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Cobrado</span>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-black text-emerald-600 tracking-tight">
          {formatCurrency(summary.totalConfirmed)}
        </div>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          {summary.countConfirmed} {summary.countConfirmed === 1 ? 'pago confirmado' : 'pagos confirmados'}
        </p>
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import { FileText, CheckCircle2, DollarSign, Clock } from 'lucide-react';
import { ActivityItem } from '@/lib/clientActivity';

interface ActivityTimelineProps {
  items: ActivityItem[];
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ items }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-slate-400 border border-slate-800">
          <Clock className="h-6 w-6" />
        </div>
        <h4 className="mt-3 text-sm font-bold text-white">Sin historial de actividad</h4>
        <p className="mt-1 text-xs text-slate-400">
          Aquí aparecerán las cotizaciones enviadas, contratos firmados y pagos confirmados de este cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;

          let iconBg = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
          let Icon = FileText;
          let badgeText = 'Cotización';

          if (item.type === 'contract') {
            iconBg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            Icon = CheckCircle2;
            badgeText = 'Contrato';
          } else if (item.type === 'payment') {
            iconBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            Icon = DollarSign;
            badgeText = 'Pago';
          }

          const formattedDate = new Date(item.date).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          return (
            <li key={item.id}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-slate-800"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconBg} shadow-xs`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                        {badgeText}
                      </span>
                      <span className="text-xs font-medium text-slate-400">{formattedDate}</span>
                    </div>
                    <h5 className="mt-2 text-sm font-bold text-white">{item.title}</h5>
                    <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

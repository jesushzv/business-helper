'use client';

import React from 'react';
import { Activity, ShieldCheck, AlertTriangle, AlertCircle, TrendingUp } from 'lucide-react';

export function HealthScoreExplainer() {
  const tiers = [
    {
      score: '90–100',
      label: 'Cliente de Alto Valor',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      badgeColor: 'bg-emerald-500 text-slate-950',
      icon: ShieldCheck,
      desc: 'Historial de pago impecable (<3 días de vencimiento). Envíos y confirmaciones inmediatas por WhatsApp.',
      recommendation: 'Recomendación: Otorgar días de crédito ampliados y prioridad en suministro.',
    },
    {
      score: '70–89',
      label: 'Riesgo Moderado',
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      badgeColor: 'bg-amber-500 text-slate-950',
      icon: AlertTriangle,
      desc: 'Pagos recurrentes pero con retrasos leves de 5 a 12 días. Requiere recordatorios por WhatsApp.',
      recommendation: 'Recomendación: Enviar recordatorios automáticos 3 días antes del vencimiento.',
    },
    {
      score: '<70',
      label: 'Riesgo Severo',
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      badgeColor: 'bg-rose-500 text-white',
      icon: AlertCircle,
      desc: 'Múltiples facturas o cotizaciones vencidas >15 días. Promesas de pago incumplidas.',
      recommendation: 'Recomendación: Solicitar anticipo del 50% antes de generar nuevas cotizaciones.',
    },
  ];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8 text-left">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-slate-800 pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" />
            <span>Inteligencia de Cobranza</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Score de Salud del Cliente (0–100)
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm max-w-2xl">
            Protege tu flujo de efectivo evaluando automáticamente el riesgo crediticio de cada cliente antes de surtir o enviar nuevas cotizaciones.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black text-xl border border-emerald-500/20">
            94
          </div>
          <div className="text-xs">
            <div className="font-bold text-white">Score Promedio de PyMEs</div>
            <div className="text-emerald-400 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> +35% Cobranza a Tiempo
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier, idx) => {
          const Icon = tier.icon;
          return (
            <div
              key={idx}
              className={`p-6 rounded-2xl border ${tier.color} space-y-4 flex flex-col justify-between`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${tier.badgeColor}`}>
                    Score {tier.score}
                  </span>
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white">{tier.label}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{tier.desc}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[11px] font-semibold text-slate-200">
                {tier.recommendation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

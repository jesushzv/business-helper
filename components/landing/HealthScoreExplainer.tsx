'use client';

import React from 'react';
import { Activity, ShieldCheck, AlertTriangle, AlertCircle, TrendingUp } from 'lucide-react';

export function HealthScoreExplainer() {
  // Mirrors the shipped engine — lib/clientHealthScore.ts computes exactly
  // these four tiers (≥90 / 75–89 / 50–74 / <50) with these labels. The page
  // used to advertise three different tiers with mechanics the engine does
  // not have (#232); if the engine's cuts change, change this with it.
  const tiers = [
    {
      score: '90–100',
      label: 'Excelente',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      badgeColor: 'bg-emerald-500 text-slate-950',
      icon: ShieldCheck,
      desc: 'Paga a tiempo y no tiene saldos vencidos. Aprueba y confirma sin necesidad de recordatorios.',
      recommendation: 'Recomendación: Otorgar días de crédito ampliados y prioridad en suministro.',
    },
    {
      score: '75–89',
      label: 'Bueno',
      color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
      badgeColor: 'bg-sky-500 text-slate-950',
      icon: ShieldCheck,
      desc: 'Buen pagador con retrasos ocasionales de pocos días. Responde bien a los recordatorios.',
      recommendation: 'Recomendación: Enviar recordatorios automáticos antes del vencimiento.',
    },
    {
      score: '50–74',
      label: 'En Riesgo',
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      badgeColor: 'bg-amber-500 text-slate-950',
      icon: AlertTriangle,
      desc: 'Acumula saldos vencidos o retrasos frecuentes. Requiere seguimiento cercano de cobranza.',
      recommendation: 'Recomendación: Limitar el crédito y dar seguimiento por WhatsApp a cada factura.',
    },
    {
      score: '<50',
      label: 'Moroso',
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      badgeColor: 'bg-rose-500 text-white',
      icon: AlertCircle,
      desc: 'Facturas vencidas por más de 30 días o promesas de pago incumplidas.',
      recommendation: 'Recomendación: Solicitar anticipo del 50% antes de generar nuevas cotizaciones.',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8 text-left">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-slate-800 pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" />
            <span>Inteligencia de Cobranza</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Confianza de Pago (0–100)
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
            <div className="font-bold text-white">Ejemplo: cliente Excelente</div>
            <div className="text-emerald-400 font-semibold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Calculado del historial real de pagos
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

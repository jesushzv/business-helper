'use client';

import React from 'react';
import { TRUST_BADGES } from '@/lib/trustData';
import { Building2, ShieldCheck, CheckCircle2, Zap } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Zap,
};

export function TrustBadges() {
  return (
    <div className="w-full">
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          Garantía y Seguridad Fiscal
        </span>
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Infraestructura Segura y 100% Conforme ante el SAT
        </h3>
        <p className="text-slate-400 text-xs sm:text-sm">
          Cumplimiento normativo Anexo 20 SAT, encriptación bancaria y validación de transferencias Banxico SPEI.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {TRUST_BADGES.map((badge) => {
          const Icon = ICON_MAP[badge.iconName] || ShieldCheck;

          return (
            <div
              key={badge.id}
              className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all shadow-lg flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-slate-800 text-emerald-300 border border-slate-700">
                    {badge.badgeTag}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-bold text-white tracking-tight">{badge.title}</h4>
                  <span className="text-xs font-semibold text-emerald-400 block mt-0.5">{badge.subtitle}</span>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{badge.description}</p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Verificado en Producción</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

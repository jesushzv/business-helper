'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { PAIN_POINTS_SOLUTIONS, APP_TIERS, VALUE_ADDS_ROI } from '@/lib/tierFeaturesData';

interface FeatureTierComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeatureTierComparisonModal: React.FC<FeatureTierComparisonModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'painpoints' | 'roi'>('matrix');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative my-8 w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                Planes, Funcionalidades y Valor PyME
              </h2>
              <p className="text-xs text-slate-400">
                Diseñado para acelerar la cobranza y simplificar operaciones en México
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition-all hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-800 bg-slate-900/80 px-6 pt-3">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'matrix'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Comparación de Planes
          </button>
          <button
            onClick={() => setActiveTab('painpoints')}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'painpoints'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Puntos de Dolor & Solución
          </button>
          <button
            onClick={() => setActiveTab('roi')}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'roi'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Impacto & ROI Estimado
          </button>
        </div>

        {/* Body Content */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {/* TAB 1: TIERS MATRIX */}
          {activeTab === 'matrix' && (
            <div className="space-y-6">
              <div className="text-center max-w-2xl mx-auto mb-6">
                <span className="rounded-full bg-emerald-950 px-3.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                  SIN CONTRATOS FORZOSOS • PRUEBA 14 DÍAS GRATIS
                </span>
                <h3 className="mt-3 text-2xl font-extrabold text-white">
                  Elige el plan ideal para escalar tu negocio
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {APP_TIERS.map((tier) => (
                  <div
                    key={tier.id}
                    className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all ${
                      tier.recommended
                        ? 'border-emerald-500/60 bg-linear-to-b from-slate-900 via-slate-900 to-emerald-950/40 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    {tier.badge && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-black tracking-wider uppercase text-slate-950 shadow-md">
                        {tier.badge}
                      </span>
                    )}

                    <div>
                      <h4 className="text-lg font-bold text-white">{tier.name}</h4>
                      <p className="mt-1 text-xs text-slate-400">{tier.description}</p>

                      <div className="my-4 flex items-baseline gap-1">
                        <span className="font-mono text-3xl font-black text-white">
                          ${tier.priceMonthly.toLocaleString('es-MX')}
                        </span>
                        <span className="text-xs text-slate-400">MXN / mes</span>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-center text-[11px] font-semibold text-emerald-300">
                        {tier.targetAudience}
                      </div>

                      <div className="my-6 space-y-2.5 border-t border-slate-800 pt-4">
                        {tier.features.map((feat, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Link
                      href="/onboarding"
                      onClick={onClose}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-md transition-all active:scale-95 ${
                        tier.recommended
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : 'border border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      <span>{tier.ctaText}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PAIN POINTS & SOLUTIONS */}
          {activeTab === 'painpoints' && (
            <div className="space-y-6">
              <div className="text-center max-w-2xl mx-auto">
                <h3 className="text-2xl font-extrabold text-white">
                  ¿Por qué las PyMEs eligen Business Helper?
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Transformamos la administración informal en un motor de liquidez confiable
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {PAIN_POINTS_SOLUTIONS.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                        <AlertTriangle className="h-4 w-4" />
                        <span>PROBLEMA HABITUAL</span>
                      </div>
                      <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
                        {item.impact}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 italic font-medium">&quot;{item.painPoint}&quot;</p>

                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>SOLUCIÓN BUSINESS HELPER</span>
                      </div>
                      <p className="text-xs font-semibold text-white">{item.solution}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: ROI & VALUE ADDS */}
          {activeTab === 'roi' && (
            <div className="space-y-6">
              <div className="text-center max-w-2xl mx-auto">
                <h3 className="text-2xl font-extrabold text-white">
                  Métricas de Impacto Financiero
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Resultados medidos en empresas mexicanas que operan con Business Helper
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                {VALUE_ADDS_ROI.map((val, idx) => (
                  <div
                    key={idx}
                    className="rounded-3xl border border-slate-800 bg-linear-to-b from-slate-900 to-slate-950 p-5 text-center shadow-lg"
                  >
                    <div className="font-mono text-4xl font-black text-emerald-400">
                      {val.metric}
                    </div>
                    <div className="mt-2 text-sm font-bold text-white">{val.label}</div>
                    <p className="mt-1 text-xs text-slate-400">{val.description}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-950/30 p-6 text-center">
                <h4 className="text-lg font-bold text-white">
                  ¿Listo para recuperar el control de tu flujo de efectivo?
                </h4>
                <p className="mt-1 text-xs text-emerald-200">
                  Comienza hoy tu prueba gratuita de 14 días sin ingresar tarjeta de crédito.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/onboarding"
                    onClick={onClose}
                    className="flex min-h-[48px] items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-950/60 hover:bg-emerald-400 active:scale-95"
                  >
                    <span>Iniciar Prueba Gratis</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-6 py-4">
          <p className="text-xs text-slate-500">
            Facturación SAT CFDI 4.0 • Validación Banxico SPEI • Multi-tenant RLS Security
          </p>
          <button
            onClick={onClose}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

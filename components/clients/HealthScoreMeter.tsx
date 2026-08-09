'use client';

import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, HelpCircle, X, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { calculateClientHealthScore, MilestonePaymentRecord } from '@/lib/clientHealthScore';

interface HealthScoreMeterProps {
  score?: number;
  milestones?: MilestonePaymentRecord[];
  compact?: boolean;
}

export const HealthScoreMeter: React.FC<HealthScoreMeterProps> = ({ score: propScore, milestones, compact = false }) => {
  const [showModal, setShowModal] = useState(false);

  // Precedence (#108): a score derived from real payment history beats the
  // stored column — the old order was reversed, so the milestones callers
  // passed never affected the displayed number. And unknown is unknown: a
  // client with no signal renders "Sin historial", never 100 "Excelente",
  // because this meter sits on the surface where credit is decided.
  const derived =
    milestones && milestones.length > 0 ? calculateClientHealthScore(milestones) : null;
  const score = derived?.score ?? propScore ?? null;

  if (score === null) {
    return compact ? (
      <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-bold text-slate-400">
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Sin historial</span>
      </span>
    ) : (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-400">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Health Score Financiero</h4>
            <p className="text-sm font-extrabold text-white">Sin historial de pagos</p>
            <p className="text-xs text-slate-400">Se calculará con los primeros cobros de este cliente.</p>
          </div>
        </div>
      </div>
    );
  }

  let rating = 'Excelente';
  let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  let barColor = 'bg-emerald-500';
  let Icon = ShieldCheck;

  if (score >= 90) {
    rating = 'Excelente';
    badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    barColor = 'bg-emerald-500';
    Icon = ShieldCheck;
  } else if (score >= 75) {
    rating = 'Bueno';
    badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    barColor = 'bg-blue-500';
    Icon = ShieldCheck;
  } else if (score >= 50) {
    rating = 'En Riesgo';
    badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    barColor = 'bg-amber-500';
    Icon = ShieldAlert;
  } else {
    rating = 'Moroso';
    badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    barColor = 'bg-rose-500';
    Icon = ShieldX;
  }

  const toggleModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowModal((prev) => !prev);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={toggleModal}
          className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-all hover:opacity-90 active:scale-95 cursor-pointer ${badgeColor}`}
          title="Ver cómo se calcula el Health Score"
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{score}/100</span>
          <span className="opacity-75">• {rating}</span>
          <HelpCircle className="ml-0.5 h-3 w-3 opacity-60 hover:opacity-100" />
        </button>
      ) : (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-xl text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${badgeColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Health Score Financiero</h4>
                  <button
                    type="button"
                    onClick={toggleModal}
                    className="text-slate-500 transition-colors hover:text-indigo-400 focus:outline-none cursor-pointer"
                    title="¿Cómo se calcula este puntaje?"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm font-extrabold text-white">{rating}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">{score}</span>
              <span className="text-xs font-bold text-slate-400">/100</span>
            </div>
          </div>

          {/* Progress Gauge Bar */}
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.max(5, score)}%` }}
            />
          </div>
        </div>
      )}

      {/* Health Score Methodology Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
          onClick={toggleModal}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl transition-all text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">Health Score Financiero (0-100)</h3>
                  <p className="text-xs text-slate-400">Algoritmo de confiabilidad de cobro y pagos del cliente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleModal}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-300">
              <div className="rounded-2xl bg-indigo-950/60 border border-indigo-500/30 p-3.5 text-indigo-200">
                <p className="font-semibold">
                  El <strong>Health Score</strong> evalúa automáticamente el historial de pagos y facturas pendientes de tus clientes para ayudarte a identificar riesgos financieros antes de otorgar crédito.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white uppercase tracking-wider text-[11px] mb-2">Reglas de Cálculo:</h4>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 rounded-xl bg-slate-950 border border-slate-800 p-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <span className="font-bold text-white">Puntaje Inicial (100 pts):</span>
                      <p className="text-slate-400">Todo cliente inicia con 100 puntos perfectos.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl bg-slate-950 border border-slate-800 p-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <span className="font-bold text-white">Retraso en Pagos Confirmados:</span>
                      <p className="text-slate-400">• 1 a 7 días tarde: <strong>-5 puntos</strong></p>
                      <p className="text-slate-400">• Más de 7 días tarde: <strong>-15 puntos</strong></p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl bg-slate-950 border border-slate-800 p-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <span className="font-bold text-white">Cuentas Pendientes Vencidas:</span>
                      <p className="text-slate-400">• 1 a 7 días vencido: <strong>-10 puntos</strong></p>
                      <p className="text-slate-400">• 8 a 30 días vencido: <strong>-25 puntos</strong></p>
                      <p className="text-slate-400">• Más de 30 días vencido: <strong>-40 puntos</strong></p>
                    </div>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white uppercase tracking-wider text-[11px] mb-2">Rangos de Clasificación:</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-2.5">
                    <span className="font-bold text-emerald-400">90 - 100: Excelente 🟢</span>
                    <p className="text-[11px] text-emerald-300">Pagos al día y sin mora.</p>
                  </div>
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-2.5">
                    <span className="font-bold text-blue-400">75 - 89: Bueno 🔵</span>
                    <p className="text-[11px] text-blue-300">Retrasos menores ocasionales.</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-2.5">
                    <span className="font-bold text-amber-400">50 - 74: En Riesgo 🟡</span>
                    <p className="text-[11px] text-amber-300">Pagos vencidos recurrentes.</p>
                  </div>
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-2.5">
                    <span className="font-bold text-rose-400">0 - 49: Moroso 🔴</span>
                    <p className="text-[11px] text-rose-300">Cartera vencida &gt; 30 días.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={toggleModal}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-colors active:scale-95 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


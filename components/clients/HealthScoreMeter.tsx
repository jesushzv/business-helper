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
  const result = milestones ? calculateClientHealthScore(milestones) : null;
  const score = propScore ?? result?.score ?? 100;

  let rating = 'Excelente';
  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let barColor = 'bg-emerald-500';
  let Icon = ShieldCheck;

  if (score >= 90) {
    rating = 'Excelente';
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    barColor = 'bg-emerald-500';
    Icon = ShieldCheck;
  } else if (score >= 75) {
    rating = 'Bueno';
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    barColor = 'bg-blue-500';
    Icon = ShieldCheck;
  } else if (score >= 50) {
    rating = 'En Riesgo';
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    barColor = 'bg-amber-500';
    Icon = ShieldAlert;
  } else {
    rating = 'Moroso';
    badgeColor = 'bg-red-50 text-red-700 border-red-200';
    barColor = 'bg-red-500';
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
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${badgeColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Health Score Financiero</h4>
                  <button
                    type="button"
                    onClick={toggleModal}
                    className="text-gray-400 transition-colors hover:text-indigo-600 focus:outline-none"
                    title="¿Cómo se calcula este puntaje?"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm font-extrabold text-gray-900">{rating}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-gray-900">{score}</span>
              <span className="text-xs font-bold text-gray-400">/100</span>
            </div>
          </div>

          {/* Progress Gauge Bar */}
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-xs"
          onClick={toggleModal}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 font-bold text-indigo-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900">Health Score Financiero (0-100)</h3>
                  <p className="text-xs text-gray-500">Algoritmo de confiabilidad de cobro y pagos del cliente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleModal}
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-gray-600">
              <div className="rounded-2xl bg-indigo-50/70 p-3.5 text-indigo-900">
                <p className="font-semibold">
                  El <strong>Health Score</strong> evalúa automáticamente el historial de pagos y facturas pendientes de tus clientes para ayudarte a identificar riesgos financieros antes de otorgar crédito.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] mb-2">Reglas de Cálculo:</h4>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 rounded-xl bg-gray-50 p-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-900">Puntaje Inicial (100 pts):</span>
                      <p className="text-gray-500">Todo cliente inicia con 100 puntos perfectos.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl bg-gray-50 p-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-900">Retraso en Pagos Confirmados:</span>
                      <p className="text-gray-500">• 1 a 7 días tarde: <strong>-5 puntos</strong></p>
                      <p className="text-gray-500">• Más de 7 días tarde: <strong>-15 puntos</strong></p>
                    </div>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl bg-gray-50 p-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-900">Cuentas Pendientes Vencidas:</span>
                      <p className="text-gray-500">• 1 a 7 días vencido: <strong>-10 puntos</strong></p>
                      <p className="text-gray-500">• 8 a 30 días vencido: <strong>-25 puntos</strong></p>
                      <p className="text-gray-500">• Más de 30 días vencido: <strong>-40 puntos</strong></p>
                    </div>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] mb-2">Rangos de Clasificación:</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                    <span className="font-bold text-emerald-800">90 - 100: Excelente 🟢</span>
                    <p className="text-[11px] text-emerald-700">Pagos al día y sin mora.</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5">
                    <span className="font-bold text-blue-800">75 - 89: Bueno 🔵</span>
                    <p className="text-[11px] text-blue-700">Retrasos menores ocasionales.</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                    <span className="font-bold text-amber-800">50 - 74: En Riesgo 🟡</span>
                    <p className="text-[11px] text-amber-700">Pagos vencidos recurrentes.</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-2.5">
                    <span className="font-bold text-red-800">0 - 49: Moroso 🔴</span>
                    <p className="text-[11px] text-red-700">Cartera vencida &gt; 30 días.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={toggleModal}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 active:scale-95"
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


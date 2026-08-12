'use client';

import React, { useState } from 'react';
import { Calculator, Clock, TrendingUp, Sparkles, Plus, Minus } from 'lucide-react';

export function RoiCalculator() {
  const [quotesPerMonth, setQuotesPerMonth] = useState<number>(30);
  const [avgQuoteValue, setAvgQuoteValue] = useState<number>(25000);

  // Helper stepper functions
  const handleDecrementQuotes = () => setQuotesPerMonth((prev) => Math.max(5, prev - 5));
  const handleIncrementQuotes = () => setQuotesPerMonth((prev) => Math.min(150, prev + 5));

  const handleDecrementValue = () => setAvgQuoteValue((prev) => Math.max(2000, prev - 5000));
  const handleIncrementValue = () => setAvgQuoteValue((prev) => Math.min(150000, prev + 5000));

  // Calculations
  const totalVolume = quotesPerMonth * avgQuoteValue;
  // Estimate ~20 min saved per quote/followup
  const hoursSaved = Math.round(quotesPerMonth * 0.33);
  // Estimate ~15% faster collection / reduction in overdue receivables
  const acceleratedCashFlow = Math.round(totalVolume * 0.15);
  // Compare against $599 MXN Plan Negocio
  const monthlyCost = 599;
  const estimatedValue = hoursSaved * 250 + acceleratedCashFlow * 0.05;
  // The multiplier is the formula's own answer, never floored to look better:
  // a Math.max(5, …) here printed "+5x" for inputs whose real ratio was below
  // 1 (#230). Math.max(1, …) only keeps the display from rounding to "+0x" at
  // the slider minimum, where the ratio is ≈0.96 — i.e. break-even, shown as 1x.
  const roiMultiplier = Math.max(1, Math.round(estimatedValue / monthlyCost));

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      {/* Subtle Glow background */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Controls Column */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Calculator className="w-4 h-4" />
            <span>Calculadora de Impacto Financiero</span>
          </div>

          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ¿Cuánto tiempo y dinero ahorrarás?
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm mt-2">
              Ajusta el volumen de tu negocio para calcular el impacto estimado de automatizar tus cotizaciones y cobranza.
            </p>
          </div>

          {/* Slider 1: Quotes per Month */}
          <div className="space-y-3 bg-slate-950/70 p-5 rounded-2xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-slate-300">Cotizaciones al mes</span>
              <span className="text-emerald-400 text-base font-black px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                {quotesPerMonth} cotizaciones
              </span>
            </div>

            {/* Mobile Stepper Controls */}
            <div className="flex items-center justify-between gap-3 sm:hidden pt-1">
              <button
                type="button"
                onClick={handleDecrementQuotes}
                aria-label="Disminuir cotizaciones"
                className="min-h-[48px] min-w-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center font-mono font-bold text-white text-sm bg-slate-900/60 py-3 rounded-xl border border-slate-800">
                {quotesPerMonth} / mes
              </div>
              <button
                type="button"
                onClick={handleIncrementQuotes}
                aria-label="Aumentar cotizaciones"
                className="min-h-[48px] min-w-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2 hidden sm:block">
              <input
                type="range"
                min="5"
                max="150"
                step="5"
                value={quotesPerMonth}
                onChange={(e) => setQuotesPerMonth(Number(e.target.value))}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 min-h-[48px] py-3"
                aria-label="Cotizaciones al mes"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>5 / mes</span>
              <span>75 / mes</span>
              <span>150 / mes</span>
            </div>
          </div>

          {/* Slider 2: Average Quote Value */}
          <div className="space-y-3 bg-slate-950/70 p-5 rounded-2xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-slate-300">Valor promedio por cotización</span>
              <span className="text-indigo-400 text-base font-black px-3.5 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                ${avgQuoteValue.toLocaleString('es-MX')} MXN
              </span>
            </div>

            {/* Mobile Stepper Controls */}
            <div className="flex items-center justify-between gap-3 sm:hidden pt-1">
              <button
                type="button"
                onClick={handleDecrementValue}
                aria-label="Disminuir valor promedio"
                className="min-h-[48px] min-w-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="flex-1 text-center font-mono font-bold text-white text-xs bg-slate-900/60 py-3 rounded-xl border border-slate-800 truncate">
                ${avgQuoteValue.toLocaleString('es-MX')} MXN
              </div>
              <button
                type="button"
                onClick={handleIncrementValue}
                aria-label="Aumentar valor promedio"
                className="min-h-[48px] min-w-[48px] px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2 hidden sm:block">
              <input
                type="range"
                min="2000"
                max="150000"
                step="1000"
                value={avgQuoteValue}
                onChange={(e) => setAvgQuoteValue(Number(e.target.value))}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 min-h-[48px] py-3"
                aria-label="Valor promedio por cotización"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>$2,000 MXN</span>
              <span>$75,000 MXN</span>
              <span>$150,000 MXN</span>
            </div>
          </div>
        </div>

        {/* Output Cards Column */}
        <div className="lg:col-span-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Hours Saved Card */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-white">{hoursSaved} hrs</div>
              <div className="text-xs font-bold text-slate-300">Tiempo Ahorrado al Mes</div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {(() => {
                  const days = Math.max(1, Math.round(hoursSaved / 8));
                  return `Equivalente a ${days} ${days === 1 ? 'día laborable completo' : 'días laborables completos'} dedicado${days === 1 ? '' : 's'} a vender en vez de hacer trámites.`;
                })()}
              </p>
            </div>

            {/* Accelerated Cash Flow Card */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/90 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-emerald-400">
                ${acceleratedCashFlow.toLocaleString('es-MX')}
              </div>
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Cobranza Acelerada</span>
                <span className="text-[10px] text-slate-400 font-normal underline cursor-help" title="Fórmula: 15% del volumen mensual cotizado cobrado antes de tiempo mediante seguimiento automatizado">¿Cómo se calcula?</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Flujo de efectivo liberado antes de tiempo gracias a recordatorios automáticos de WhatsApp.
              </p>
            </div>
          </div>

          {/* ROI Highlight Card */}
          <div className="p-6 rounded-2xl bg-linear-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-500/30 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" /> Retorno Estimado (ROI)
              </div>
              <div className="text-2xl font-black text-white">
                +{roiMultiplier}x Retorno sobre Inversión
              </div>
              <div className="text-[11px] text-slate-300">
                Basado en Plan Negocio ($599 MXN/mes). Cancela cuando quieras.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

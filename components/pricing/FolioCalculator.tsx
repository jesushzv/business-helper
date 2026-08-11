'use client';

import React, { useState } from 'react';
import { Calculator, CheckCircle2, ArrowRight, Minus, Plus } from 'lucide-react';
import Link from 'next/link';

export function FolioCalculator() {
  const [invoicesCount, setInvoicesCount] = useState<number>(25);

  // Calculation logic:
  // Plan Inicial ($299/mo): 0 folios included, $5 per folio
  const costStarter = 299 + invoicesCount * 5;

  // Plan Negocio ($599/mo): 10 folios included, $3 per extra folio
  const extraNegocio = Math.max(0, invoicesCount - 10);
  const costNegocio = 599 + extraNegocio * 3;

  // Plan Empresa ($999/mo): 50 folios included, $2 per extra folio
  const extraEmpresa = Math.max(0, invoicesCount - 50);
  const costEmpresa = 999 + extraEmpresa * 2;

  // Best value determination
  let bestPlan = 'Negocio';
  let bestCost = costNegocio;

  if (costStarter < costNegocio && costStarter < costEmpresa) {
    bestPlan = 'Inicial';
    bestCost = costStarter;
  } else if (costEmpresa < costNegocio) {
    bestPlan = 'Empresa';
    bestCost = costEmpresa;
  }

  return (
    <div className="p-8 sm:p-10 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-8 max-w-4xl mx-auto shadow-2xl relative overflow-hidden backdrop-blur-xl">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="space-y-3 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold uppercase tracking-wider">
          <Calculator className="w-4 h-4" />
          Calculador Interactivo de Costos
        </div>
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          ¿Cuántas facturas timbras al mes?
        </h3>
        <p className="text-xs sm:text-sm text-slate-400">
          Calcula exactamente cuánto pagarás según tu volumen mensual de timbrado fiscal CFDI 4.0 ante el SAT.
        </p>
      </div>

      {/* Interactive Slider Input */}
      <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label htmlFor="invoices-slider" className="text-xs font-bold text-slate-300">
            Facturas timbradas por mes:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={300}
              value={invoicesCount}
              onChange={(e) => setInvoicesCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 min-h-[48px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 text-sm font-extrabold text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-400 font-medium">facturas / mes</span>
          </div>
        </div>

        {/* Mobile: steppers, not an 8px drag target. `RoiCalculator` already
            solved this exact problem the same way (#88/#89). */}
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <button
            type="button"
            onClick={() => setInvoicesCount((n) => Math.max(0, n - 5))}
            aria-label="Disminuir facturas por mes"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 font-bold text-emerald-400 transition-transform hover:bg-slate-800 active:scale-95"
          >
            <Minus className="h-5 w-5" />
          </button>
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 py-3 text-center font-mono text-sm font-bold text-white">
            {invoicesCount} / mes
          </div>
          <button
            type="button"
            onClick={() => setInvoicesCount((n) => Math.min(300, n + 5))}
            aria-label="Aumentar facturas por mes"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 font-bold text-emerald-400 transition-transform hover:bg-slate-800 active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <input
          id="invoices-slider"
          type="range"
          min={0}
          max={150}
          step={5}
          value={invoicesCount}
          onChange={(e) => setInvoicesCount(parseInt(e.target.value))}
          className="hidden sm:block w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />

        {/* The slider's scale legend, so it goes with the slider. Five labels
            in a nowrap `justify-between` need ~264px inside a ~231px card,
            which scrolled the whole landing page sideways at 375px (#88). */}
        <div className="hidden sm:flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0 (Solo cotizaciones)</span>
          <span>25 facturas</span>
          <span>50 facturas</span>
          <span>100 facturas</span>
          <span>150+ facturas</span>
        </div>
      </div>

      {/* Cost Comparison Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Starter Plan Breakdown */}
        <div className={`p-5 rounded-2xl border transition-all ${bestPlan === 'Inicial' ? 'bg-slate-950 border-emerald-500/80 shadow-lg' : 'bg-slate-950/50 border-slate-800'}`}>
          <span className="text-xs font-bold text-slate-400 block">Plan Inicial</span>
          <div className="text-2xl font-black text-white mt-1">${costStarter.toLocaleString('es-MX')} <span className="text-xs font-normal text-slate-400">MXN/mes</span></div>
          <p className="text-[11px] text-slate-400 mt-2">$299 base + {invoicesCount} folios × $5</p>
        </div>

        {/* Pro Plan Breakdown */}
        <div className={`p-5 rounded-2xl border transition-all ${bestPlan === 'Negocio' ? 'bg-emerald-950/40 border-2 border-emerald-500 shadow-xl shadow-emerald-950/50' : 'bg-slate-950/50 border-slate-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">Plan Negocio</span>
            {bestPlan === 'Negocio' && <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase">Mejor Valor</span>}
          </div>
          <div className="text-2xl font-black text-white mt-1">${costNegocio.toLocaleString('es-MX')} <span className="text-xs font-normal text-slate-400">MXN/mes</span></div>
          <p className="text-[11px] text-slate-300 mt-2">$599 base + {extraNegocio} folios extra × $3</p>
        </div>

        {/* Business Plan Breakdown */}
        <div className={`p-5 rounded-2xl border transition-all ${bestPlan === 'Empresa' ? 'bg-indigo-950/40 border-2 border-indigo-500 shadow-xl shadow-indigo-950/50' : 'bg-slate-950/50 border-slate-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-400">Plan Empresa</span>
            {bestPlan === 'Empresa' && <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-black uppercase">Mejor Valor</span>}
          </div>
          <div className="text-2xl font-black text-white mt-1">${costEmpresa.toLocaleString('es-MX')} <span className="text-xs font-normal text-slate-400">MXN/mes</span></div>
          <p className="text-[11px] text-slate-300 mt-2">$999 base + {extraEmpresa} folios extra × $2</p>
        </div>
      </div>

      {/* Recommendation Banner */}
      <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-slate-200">
            Recomendación para {invoicesCount} facturas/mes: <span className="text-emerald-400 font-extrabold">Plan {bestPlan}</span> (${bestCost.toLocaleString('es-MX')} MXN/mes total estimado)
          </span>
        </div>
        <Link
          href={`/register?plan=${bestPlan.toLowerCase()}`}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 min-h-[48px]"
        >
          <span>Elegir Plan {bestPlan}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

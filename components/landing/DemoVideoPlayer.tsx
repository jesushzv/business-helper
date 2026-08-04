'use client';

import React, { useState, useEffect } from 'react';
import { DEMO_WALKTHROUGH_STEPS, DemoStep } from '@/lib/trustData';
import { Play, Pause, ChevronRight, Check, MessageSquare, ShieldCheck, TrendingUp, Sparkles, Smartphone, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function DemoVideoPlayer() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setActiveStepIndex((prev) => (prev + 1) % DEMO_WALKTHROUGH_STEPS.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [isPlaying]);

  const currentStep: DemoStep = DEMO_WALKTHROUGH_STEPS[activeStepIndex];

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Demostración Interactiva (60s)</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            El flujo completo de Cotización a Cobro SPEI
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Mira cómo funciona el proceso en 4 sencillos pasos paso a paso.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 text-amber-400" /> Pausar Simulación
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-400 fill-current" /> Reproducción Automática
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DEMO_WALKTHROUGH_STEPS.map((step, idx) => {
          const isActive = idx === activeStepIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                setActiveStepIndex(idx);
                setIsPlaying(false);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer min-h-[64px] flex flex-col justify-center ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-950/40 text-white'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-extrabold uppercase text-emerald-400">Paso 0{step.stepNumber}</span>
                {isActive && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              <span className="text-xs font-bold tracking-tight truncate mt-1">{step.title}</span>
            </button>
          );
        })}
      </div>

      {/* Screen Mockup Walkthrough Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
        {/* Left Explanation */}
        <div className="lg:col-span-6 space-y-5">
          <div className="inline-block px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-mono font-semibold">
            Paso {currentStep.stepNumber} de {DEMO_WALKTHROUGH_STEPS.length}: {currentStep.title}
          </div>

          <h4 className="text-xl sm:text-2xl font-black text-white leading-tight">
            {currentStep.actionText}
          </h4>

          <p className="text-slate-300 text-sm leading-relaxed">
            {currentStep.description}
          </p>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Beneficio Clave para tu Empresa
            </div>
            <div className="text-xs text-slate-300 font-medium">
              {currentStep.stepNumber === 1 && 'Cálculo exacto de impuestos SAT sin errores manuales ni hojas de Excel.'}
              {currentStep.stepNumber === 2 && 'Cero costos de API de terceros. Tu cliente recibe el enlace directamente en WhatsApp.'}
              {currentStep.stepNumber === 3 && 'Validez legal con Sello Digital Cryptoseal SHA-256 sin requerir instalación de apps.'}
              {currentStep.stepNumber === 4 && 'Confirmación inmediata de Clave de Rastreo Banxico SPEI para caja limpia.'}
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/dashboard?demo=true"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 text-xs sm:text-sm active:scale-95 transition-all"
            >
              <span>Explorar Demo Interactiva Completa</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Right Phone Mockup Visual */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-sm rounded-[36px] border-4 border-slate-800 bg-slate-950 p-4 shadow-2xl shadow-emerald-950/50 relative">
            {/* Phone Top Notch */}
            <div className="w-32 h-4 bg-slate-900 rounded-b-xl mx-auto mb-4 border-x border-b border-slate-800 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-slate-950 border border-slate-800" />
            </div>

            {/* Dynamic Step Content */}
            {currentStep.screenMockupType === 'quote' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center text-xs font-bold text-slate-200 pb-2 border-b border-slate-800">
                  <span>Materiales Elizondo</span>
                  <span className="text-emerald-400">Cotización #Q-2026-088</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between"><span>20 Ton. Cemento Tolteca</span><span>$84,000.00</span></div>
                  <div className="flex justify-between text-slate-400"><span>IVA (16%)</span><span>$13,440.00</span></div>
                  <div className="flex justify-between font-bold text-white pt-2 border-t border-slate-800 text-xs">
                    <span>Total Net MXN</span>
                    <span className="text-emerald-400 font-extrabold">$97,440.00</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold text-center">
                  ✓ Calculado con Impuestos SAT
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'whatsapp' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-emerald-500/30">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pb-2 border-b border-slate-800">
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp Click-to-Chat</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/20 text-xs text-emerald-100 space-y-1">
                  <p className="font-semibold">Hola Construcciones Maya,</p>
                  <p className="text-[11px] text-emerald-200">Adjunto la cotización #Q-2026-088 por $97,440.00 MXN para revisión y firma:</p>
                  <div className="text-[10px] font-mono text-emerald-400 underline pt-1">
                    https://businesshelper.mx/q/cot-2026-088
                  </div>
                </div>
                <div className="p-2 bg-emerald-500 text-slate-950 font-black text-xs text-center rounded-xl">
                  Enviado con 1-Tap
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'otp' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-indigo-500/30">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 pb-2 border-b border-slate-800">
                  <Smartphone className="w-4 h-4" />
                  <span>Firma Digital Cryptoseal</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Código OTP Verificado</span>
                  <div className="text-xl font-mono font-black text-emerald-400 tracking-widest">4 8 2 - 9 1 0</div>
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 break-all">
                    Ejemplo Sello Digital Cryptoseal SHA-256: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </div>
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'spei' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-amber-500/30">
                <div className="flex items-center justify-between text-xs font-bold text-amber-400 pb-2 border-b border-slate-800">
                  <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Alerta de Pago SPEI</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px]">Banxico OK</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                  <div className="text-white font-bold">Comprobante SPEI Validado</div>
                  <div className="text-slate-400 text-[11px]">Clave Rastreo: <span className="text-white font-mono font-bold">20260803882910</span></div>
                  <div className="text-emerald-400 font-extrabold text-sm pt-1">$97,440.00 MXN Acreditados</div>
                </div>
                <div className="p-2 bg-emerald-500 text-slate-950 font-black text-xs text-center rounded-xl">
                  ✓ Factura & Recibo Listos
                </div>
              </div>
            )}

            {/* Bottom Bar */}
            <div className="mt-4 pt-3 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>Business Helper Mobile</span>
              <span className="text-emerald-400">● En Línea</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

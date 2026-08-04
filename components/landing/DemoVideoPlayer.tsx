'use client';

import React, { useState, useEffect } from 'react';
import { DEMO_WALKTHROUGH_STEPS, DemoStep } from '@/lib/trustData';
import { Play, Pause, MessageSquare, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { PhoneFrameMockup } from '@/components/landing/PhoneFrameMockup';

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
            <span>Demostración Interactiva Paso a Paso (Sin Instalación)</span>
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
          <PhoneFrameMockup>
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
                  <div className="flex justify-between font-black text-white pt-1.5 border-t border-slate-800 text-xs"><span>Total</span><span>$97,440.00 MXN</span></div>
                </div>
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center text-[11px] font-bold">
                  ✓ Enlace WhatsApp Listo (1-Tap)
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'whatsapp' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 pb-2 border-b border-slate-800">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Mensaje Automatizado de WhatsApp</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl text-xs text-slate-300 leading-relaxed font-mono border border-slate-800">
                  &quot;Hola Arq. Ramírez, adjunto cotización #Q-088 por $97,440 MXN. Haz clic aquí para aceptar y pagar: https://bh.app/q/98a72b&quot;
                </div>
                <div className="p-2.5 bg-emerald-500 text-slate-950 font-black text-xs text-center rounded-xl">
                  Enviado desde tu número por WhatsApp
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'otp' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                <div className="text-xs font-bold text-slate-200 pb-2 border-b border-slate-800 flex justify-between items-center">
                  <span>Aceptación Digital OTP</span>
                  <span className="text-emerald-400 text-[10px] font-mono">Cryptoseal SHA-256</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl text-center space-y-2 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Código de Verificación Envíado por SMS/WhatsApp</div>
                  <div className="text-xl font-mono font-black text-emerald-400 tracking-widest">[ 8 4 9 2 0 1 ]</div>
                  <div className="text-[9px] text-slate-400 font-mono">Sello: 0x8a92b...c7f4e</div>
                </div>
                <div className="p-2.5 bg-indigo-500 text-white font-bold text-xs text-center rounded-xl">
                  Cotización Aceptada Legalmente
                </div>
              </div>
            )}

            {currentStep.screenMockupType === 'spei' && (
              <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                <div className="text-xs font-bold text-slate-200 pb-2 border-b border-slate-800 flex justify-between items-center">
                  <span>Pago Recibido — Banxico SPEI</span>
                  <span className="text-emerald-400 font-bold">100% Confirmado</span>
                </div>
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-center space-y-1">
                  <div className="text-white font-bold">Comprobante SPEI Validado</div>
                  <div className="text-slate-400 text-[11px]">Clave Rastreo: <span className="text-white font-mono font-bold">20260803882910</span></div>
                  <div className="text-emerald-400 font-extrabold text-sm pt-1">$97,440.00 MXN Acreditados</div>
                </div>
                <div className="p-2.5 bg-emerald-500 text-slate-950 font-black text-xs text-center rounded-xl">
                  ✓ Factura & Recibo Listos
                </div>
              </div>
            )}

            {/* Bottom Bar */}
            <div className="mt-3 pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>Business Helper Mobile</span>
              <span className="text-emerald-400">● En Línea</span>
            </div>
          </PhoneFrameMockup>
        </div>
      </div>
    </div>
  );
}

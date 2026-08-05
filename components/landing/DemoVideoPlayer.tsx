'use client';

import React, { useState } from 'react';
import { DEMO_WALKTHROUGH_STEPS, DemoStep } from '@/lib/trustData';
import { ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { BrowserFrameMockup } from '@/components/landing/BrowserFrameMockup';
import { SmartVideoPlayer } from '@/components/landing/SmartVideoPlayer';

export function DemoVideoPlayer() {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const currentStep: DemoStep = DEMO_WALKTHROUGH_STEPS[activeStepIndex];

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-8" id="demo-walkthrough">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Recorrido Interactivo de Pantallas</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            El flujo completo de Cotización a Cobro SPEI
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Mira cómo funciona el proceso en 4 sencillos pasos paso a paso.
          </p>
        </div>
      </div>

      {/* Interactive Step Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DEMO_WALKTHROUGH_STEPS.map((step, idx) => {
          const isActive = idx === activeStepIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStepIndex(idx)}
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
              {currentStep.stepNumber === 3 && 'Aprobación con validez legal por OTP SMS/WhatsApp sin requerir instalación de apps.'}
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

        {/* Right Widescreen Browser Mockup (Used for ALL steps) */}
        <div className="lg:col-span-6 flex justify-center">
          {currentStep.screenMockupType === 'quote' && (
            <BrowserFrameMockup url="app.businesshelper.mx/quotes/new">
              <SmartVideoPlayer
                poster="/assets/demo/cuj_04_quote_wizard_modal.png"
                objectFit="cover"
                objectPosition="object-top"
                alt="Cotizador de Productos e Impuestos SAT"
              />
            </BrowserFrameMockup>
          )}

          {currentStep.screenMockupType === 'whatsapp' && (
            <BrowserFrameMockup url="app.businesshelper.mx/proposal/view">
              <SmartVideoPlayer
                poster="/assets/demo/cuj_05_public_proposal.png"
                objectFit="cover"
                objectPosition="object-top"
                alt="Propuesta interactiva enviada por enlace WhatsApp"
              />
            </BrowserFrameMockup>
          )}

          {currentStep.screenMockupType === 'otp' && (
            <BrowserFrameMockup url="app.businesshelper.mx/proposal/sign-otp">
              <SmartVideoPlayer
                poster="/assets/demo/cuj_05_signing_otp_modal.png"
                objectFit="cover"
                objectPosition="object-top"
                alt="Firma legal de propuesta por OTP SMS"
              />
            </BrowserFrameMockup>
          )}

          {currentStep.screenMockupType === 'spei' && (
            <BrowserFrameMockup url="app.businesshelper.mx/pay/spei-receipt">
              <SmartVideoPlayer
                poster="/assets/demo/cuj_07_spei_portal.png"
                objectFit="cover"
                objectPosition="object-top"
                alt="Comprobante Banxico SPEI"
              />
            </BrowserFrameMockup>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { BrowserFrameMockup } from '@/components/landing/BrowserFrameMockup';
import { Footer } from '@/components/layout/Footer';
import { getAssetUrl } from '@/lib/url';

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-transparent pointer-events-none" />

      {/* Header Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <img src={getAssetUrl('/logo-icon.svg')} alt="Business Helper" className="h-7 w-7 object-contain" />
            <span className="font-extrabold text-white text-lg tracking-tight">Business Helper</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
              Inicio
            </Link>
            <Link href="/pricing" className="text-slate-400 hover:text-white transition-colors">
              Precios
            </Link>
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Iniciar Sesión
            </Link>
            <Link
              href="/register"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/20 min-h-[36px] flex items-center"
            >
              Prueba Gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16 relative z-10">
        {/* Title Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3.5 py-1.5 rounded-full border border-indigo-500/20 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Sandbox Interactivo en Vivo</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Prueba la plataforma en vivo sin necesidad de registrarte
          </h1>
          <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
            Accede al Sandbox interactivo para probar el generador de cotizaciones, la firma OTP por WhatsApp y el flujo de conciliación SPEI en tiempo real.
          </p>

          <div className="pt-2">
            <Link
              href="/dashboard?demo=true"
              className="inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-600/30 transition-all text-sm active:scale-95 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>Entrar al Sandbox Interactivo Ahora →</span>
            </Link>
          </div>
        </div>

        {/* Browser Mockup Showcase */}
        <div className="max-w-5xl mx-auto">
          <BrowserFrameMockup url="app.businesshelper.app/dashboard?demo=true">
            <img
              src={getAssetUrl('/assets/demo/cuj_02_dashboard_kpis.png')}
              alt="Business Helper Sandbox Interactivo — Control de Cotizaciones"
              className="w-full h-full object-cover object-top rounded-b-xl"
            />
          </BrowserFrameMockup>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Cotizaciones en 2 Minutos</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Crea propuestas profesionales con catálogo de productos y cálculo automático de impuestos IVA/retenciones SAT.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Firma OTP por WhatsApp</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tus clientes aprueban cotizaciones en 1 clic con código SMS/OTP legal sin instalar aplicaciones.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Timbrado CFDI 4.0 SAT</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Emisión instantánea de facturas electrónicas timbradas ante el SAT con un solo toque sin complicaciones contables.
            </p>
          </div>
        </div>

        {/* Action Banner */}
        <div className="max-w-4xl mx-auto p-8 rounded-3xl bg-linear-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-slate-800 text-center space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl sm:text-3xl font-black text-white">¿Listo para probarlo con tus propias cotizaciones?</h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Accede al Sandbox interactivo o registra tu negocio en menos de 3 minutos sin costo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard?demo=true"
              className="w-full sm:w-auto min-h-[50px] px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span>Explorar Sandbox Interactivo</span>
            </Link>
            <Link
              href="/register"
              className="w-full sm:w-auto min-h-[50px] px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <span>Comenzar Prueba Gratis (14 Días)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

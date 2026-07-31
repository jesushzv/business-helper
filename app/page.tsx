import React from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  TrendingUp,
  FileCheck,
  Smartphone,
  ArrowRight,
  Check,
  Zap,
  Building2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const metadata = {
  title: 'Business Helper — Control de Cotizaciones, Cobranza y Facturación para PyMEs en México',
  description:
    'La plataforma todo-en-uno para PyMEs en México. Genera cotizaciones en 2 minutos, envíalas por WhatsApp y mantén el control de quién te debe dinero.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner Announcement */}
      <div className="bg-linear-to-r from-indigo-600 via-indigo-500 to-emerald-500 text-white text-center py-2 px-4 text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Lanzamiento Oficial Beta en México — Prueba 14 días sin costo</span>
      </div>

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                Business<span className="text-indigo-400">Helper</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                México
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors px-3 py-2 rounded-xl hover:bg-slate-900"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/onboarding"
              className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all flex items-center gap-2 active:scale-95"
            >
              <span>Probar Gratis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[250px] bg-emerald-500/15 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Hero Left Content */}
            <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wide uppercase">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                La plataforma todo-en-uno para PyMEs en México
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                Controla tus cotizaciones, cobranza y facturación <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 via-indigo-300 to-emerald-400">desde tu celular</span>.
              </h1>

              <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Genera cotizaciones profesionales en 2 minutos, envíalas por WhatsApp y mantén el control visual de quién te debe dinero — todo sin implementar sistemas complejos de miles de pesos.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/onboarding"
                  className="w-full sm:w-auto min-h-[52px] px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-3 text-base active:scale-95"
                >
                  <span>Probar 14 Días Gratis</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto min-h-[52px] px-6 py-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <span>Ver Panel de Demostración</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-6 text-xs text-slate-400 pt-2">
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" /> Sin tarjeta de crédito
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" /> Configuración en 3 min
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" /> SAT CFDI 4.0
                </span>
              </div>
            </div>

            {/* Hero Right Visual Mockup */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl">
                {/* Header Mockup */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-400">Centro de Control — Mobile</span>
                </div>

                {/* Mockup Body Content */}
                <div className="mt-6 space-y-4">
                  {/* KPI Card */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Por Cobrar Este Mes</span>
                    <div className="text-3xl font-black text-white">$145,000.00 MXN</div>
                    <div className="flex items-center gap-2 pt-1 text-xs text-emerald-400 font-semibold">
                      <TrendingUp className="w-4 h-4" /> 3 cobramientos agendados
                    </div>
                  </div>

                  {/* Status Item */}
                  <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Construcciones Maya</div>
                      <div className="text-[11px] text-slate-400">Cotización #Q-2026-088</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Aceptado por OTP
                    </span>
                  </div>

                  {/* WhatsApp Action Preview */}
                  <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-300">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <span>Recordatorio WhatsApp listo</span>
                    </div>
                    <span className="text-[11px] font-extrabold text-white px-3 py-1 bg-emerald-600 rounded-lg shadow-xs">
                      1-Tap Share
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="py-20 border-t border-slate-900 bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              Diseñado para el Empresario Mexicano
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Todo lo que necesitas para operar sin complicaciones
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Elimina los archivos de Excel perdidos, los recordatorios manuales de cobro y las llamadas incómodas a clientes.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Cotiza por WhatsApp</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Genera propuestas elegantes con tu logotipo en un enlace interactivo. Tus clientes las aceptan con un código OTP en su celular.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Quién Me Debe</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Visualiza pagos vencidos, por vencer y confirmados en un panel Kanban intuitivo. Programa recordatorios en 1 tap.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Validación SPEI</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Portal público para que tus clientes suban su comprobante SPEI y Clave de Rastreo Banxico en segundos.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-indigo-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">100% Celular</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Maneja tu negocio desde la bodega, obra o ruta con botones táctiles de 48px+ diseñados para la agilidad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Planes transparentes en pesos mexicanos
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Sin contratos forzosos. Cancela en cualquier momento desde tu panel de ajustes.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Emprendedor Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Emprendedor</h3>
                <p className="text-xs text-slate-400 mt-1">Ideal para personas físicas y pequeños negocios.</p>
              </div>
              <div className="text-3xl font-black text-white">$299 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Hasta 50 cotizaciones / mes</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Enlaces directos a WhatsApp</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Portal de comprobantes SPEI</li>
              </ul>
              <Link href="/onboarding" className="block text-center w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs">
                Seleccionar Emprendedor
              </Link>
            </div>

            {/* Negocio Tier (Featured) */}
            <div className="p-8 rounded-3xl bg-indigo-950/40 border-2 border-indigo-500 space-y-6 relative shadow-2xl shadow-indigo-900/40">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-black tracking-wide uppercase">
                Más Popular
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Negocio</h3>
                <p className="text-xs text-slate-300 mt-1">Para negocios en crecimiento que buscan acelerar cobros.</p>
              </div>
              <div className="text-3xl font-black text-white">$599 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
              <ul className="space-y-3 text-xs text-slate-200">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cotizaciones ilimitadas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Firma digital OTP con sello SHA-256</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Panel de Cobranza Kanban + Recordatorios</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Score de Salud del Cliente</li>
              </ul>
              <Link href="/onboarding" className="block text-center w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md">
                Probar 14 Días Gratis
              </Link>
            </div>

            {/* Empresa Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Empresa</h3>
                <p className="text-xs text-slate-400 mt-1">Para agencias y distribuidoras corporativas.</p>
              </div>
              <div className="text-3xl font-black text-white">$999 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Todo lo del plan Negocio</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Timbrado SAT CFDI 4.0 ilimitado</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Descarga 1-click ZIP para Contador</li>
              </ul>
              <Link href="/onboarding" className="block text-center w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs">
                Contactar Ventas
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span>© 2026 Business Helper S.A.P.I. de C.V. Todos los derechos reservados.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">
              Aviso de Privacidad (LFPDPPP)
            </Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">
              Términos del Servicio
            </Link>
            <Link href="/dashboard" className="hover:text-slate-300 transition-colors">
              Panel de Control
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

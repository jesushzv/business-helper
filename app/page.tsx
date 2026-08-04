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
  ShieldCheck,
  Star,
  Download,
  Mail,
  MapPin,
} from 'lucide-react';
import { RoiCalculator } from '@/components/landing/RoiCalculator';
import { FaqAccordion } from '@/components/landing/FaqAccordion';
import { TrustBadges } from '@/components/landing/TrustBadges';
import { TeamSection } from '@/components/landing/TeamSection';
import { ContactSection } from '@/components/landing/ContactSection';
import { DemoVideoPlayer } from '@/components/landing/DemoVideoPlayer';
import { TESTIMONIALS, CONTACT_INFO } from '@/lib/trustData';

export const metadata = {
  title: 'Business Helper — Control de Cotizaciones, Cobranza y Facturación para PyMEs en México',
  description:
    'La plataforma todo-en-uno para PyMEs en México. Genera cotizaciones en 2 minutos, envíalas por WhatsApp y mantén el control de quién te debe dinero.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Banner Announcement */}
      <div className="bg-linear-to-r from-indigo-700 via-indigo-600 to-emerald-500 text-white text-center py-2.5 px-4 text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2 shadow-md min-h-[40px]">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>⚡ LA PLATAFORMA TODO-EN-UNO PARA PYMES EN MÉXICO — Prueba 14 Días Sin Costo</span>
      </div>

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.svg" alt="Business Helper" className="h-10 w-10 object-contain" />
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                Business<span className="text-emerald-400">Helper</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                México
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-slate-300">
            <a href="#caracteristicas" className="hover:text-emerald-400 transition-colors py-2">
              Características
            </a>
            <a href="#demostracion" className="hover:text-emerald-400 transition-colors py-2">
              Demo Interactiva
            </a>
            <a href="#garantia" className="hover:text-emerald-400 transition-colors py-2">
              Seguridad SAT
            </a>
            <a href="#testimonios" className="hover:text-emerald-400 transition-colors py-2">
              Casos de Éxito
            </a>
            <a href="#precios" className="hover:text-emerald-400 transition-colors py-2">
              Precios
            </a>
            <a href="#equipo" className="hover:text-emerald-400 transition-colors py-2">
              Nosotros
            </a>
            <a href="#contacto" className="hover:text-emerald-400 transition-colors py-2">
              Contacto
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="min-h-[48px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors rounded-xl hover:bg-slate-900 flex items-center justify-center"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/onboarding"
              className="min-h-[48px] px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-black rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 active:scale-95"
            >
              <span>Probar Gratis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-emerald-500/15 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[250px] bg-indigo-600/20 blur-[110px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Hero Left Content */}
            <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-wide uppercase">
                <Zap className="w-3.5 h-3.5" />
                <span>Control Operativo y Financiero para PyMEs</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                Controla tus cotizaciones, cobranza y facturación <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 via-teal-300 to-indigo-400">desde tu celular</span>.
              </h1>

              <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Genera cotizaciones profesionales en 2 minutos, envíalas por WhatsApp y mantén el control de quién te debe dinero — todo sin implementar sistemas complejos de miles de pesos.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/onboarding"
                  className="w-full sm:w-auto min-h-[54px] px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-3 text-base active:scale-95"
                >
                  <span>Probar 14 Días Gratis</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#demostracion"
                  className="w-full sm:w-auto min-h-[54px] px-6 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <span>Ver Demostración en Vivo</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </a>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs text-slate-400 pt-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Check className="w-4 h-4 text-emerald-400" /> Sin tarjeta de crédito
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Check className="w-4 h-4 text-emerald-400" /> Configuración en 3 min
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Check className="w-4 h-4 text-emerald-400" /> SAT CFDI 4.0 & SPEI Banxico
                </span>
              </div>

              {/* Micro Social Proof Banner */}
              <div className="pt-4 border-t border-slate-900 flex items-center justify-center lg:justify-start gap-3">
                <div className="flex -space-x-2 overflow-hidden">
                  <div className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-950 bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">RE</div>
                  <div className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-950 bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">MF</div>
                  <div className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-950 bg-teal-600 text-white font-bold text-xs flex items-center justify-center">CT</div>
                  <div className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-950 bg-amber-600 text-white font-bold text-xs flex items-center justify-center">SM</div>
                </div>
                <div className="text-xs text-slate-400 text-left">
                  <div className="flex items-center text-amber-400 gap-0.5">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </div>
                  <span className="font-bold text-slate-200">+500 PyMEs en México</span> confían en Business Helper
                </div>
              </div>
            </div>

            {/* Hero Right Visual Mockup */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-2xl shadow-emerald-950/40 backdrop-blur-xl">
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
                      <TrendingUp className="w-4 h-4 text-emerald-400" /> 3 cobranzas agendadas por WhatsApp
                    </div>
                  </div>

                  {/* Status Item */}
                  <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Construcciones Maya S.A. de C.V.</div>
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
                    <span className="text-[11px] font-extrabold text-slate-950 px-3 py-1 bg-emerald-400 rounded-lg shadow-xs">
                      1-Tap Share
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Propositions Grid */}
      <section id="caracteristicas" className="py-20 border-t border-slate-900 bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Ventajas Competitivas
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Diseñado exclusivamente para la realidad del negocio en México
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Elimina los archivos de Excel perdidos, los recordatorios manuales de cobro y la fricción contable ante el SAT.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Cotiza y Cierra por WhatsApp</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Envía propuestas elegantes con tu logotipo en un enlace interactivo. Tu cliente revisa en su celular y aprueba con 1 toque por OTP.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Cobranza Visual &ldquo;Quién Me Debe&rdquo;</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Un mapa de dinero en tiempo real ordenado por facturas vencidas, por vencer y cobradas con recordatorios automáticos por WhatsApp.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Notas de Venta y SAT CFDI 4.0</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Entrega notas de venta y recibos de pago en PDF al instante. Si lo requieres, timbra facturas fiscales CFDI 4.0 y exporta paquetes ZIP a tu contador.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4 hover:border-emerald-500/40 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">100% Celular (Sin Computadora)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Opera desde tu iPhone o Android en la obra, la bodega o en ruta con botones táctiles de 48px+ diseñados para la agilidad cotidiana.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase Details */}
      <section className="py-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">

          {/* Showcase Item 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                01. Generador de Cotizaciones
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Crea propuestas profesionales en 3 pasos con cálculo automático de impuestos SAT
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Selecciona productos o servicios de tu catálogo. El sistema calcula automáticamente el IVA (16%), retenciones (ISR/IVA para personas morales) y genera una plantilla impecable con tu logotipo lista para enviar por WhatsApp.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Cálculo automático de IVA 16% y retenciones SAT
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Plantillas con logotipo y colores de tu empresa
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Enlace interactivo único para cada propuesta
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3 text-xs font-bold text-slate-300">
                  <span>Suministro Material de Construcción</span>
                  <span className="text-emerald-400">$97,440.00 MXN</span>
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between"><span>Subtotal (20 Ton. Cemento)</span><span>$84,000.00</span></div>
                  <div className="flex justify-between"><span>IVA (16%)</span><span>$13,440.00</span></div>
                  <div className="flex justify-between font-bold text-white pt-2 border-t border-slate-800"><span>Total Final</span><span className="text-emerald-400">$97,440.00</span></div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
                  ✓ Enlace listo para enviar por WhatsApp
                </div>
              </div>
            </div>
          </div>

          {/* Showcase Item 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 lg:order-2 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                02. Portal SPEI & Firma Digital Cryptoseal
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Tu cliente autoriza con OTP y sube su comprobante SPEI sin crear cuentas
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Al recibir tu mensaje en WhatsApp, tu cliente hace clic en el enlace, firma electrónicamente mediante un código OTP a su celular con sello criptográfico SHA-256 y adjunta su comprobante de transferencia Banxico SPEI.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Firma con código OTP enviado al celular del cliente
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Registro de Clave de Rastreo Banxico para validación
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Notificación instantánea en tu celular al recibir pago
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 lg:order-1">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Sello Digital Cryptoseal SHA-256
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400/90 break-all bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 font-sans font-medium block mb-1 text-[10px]">Ejemplo Sello Digital SHA-256:</span>
                    sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Comprobante SPEI PDF</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">Subido</span>
                </div>
              </div>
            </div>
          </div>

          {/* Showcase Item 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                03. Exportación 1-Clic para Contador
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Entrega mensual a tu despacho contable sin perder horas reconciliando
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Descarga en un solo clic un archivo ZIP comprimido con todas tus notas de venta en PDF, comprobantes de pago SPEI, resúmenes CSV de ingresos y facturas XML de forma ordenada.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Paquete ZIP completo listo para enviar por correo o WhatsApp
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Resumen estructurado en formato CSV con desglose de impuestos
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Historial de clientes con RFC y régimen fiscal SAT
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Paquete_Contable_Agosto_2026.zip</div>
                      <div className="text-[10px] text-slate-400">PDFs, XMLs, SPEI y CSV de ventas</div>
                    </div>
                  </div>
                  <span className="min-h-[48px] px-4 py-2 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 flex items-center justify-center">
                    1-Click Export
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Demo Video Section (Task A3) */}
      <section id="demostracion" className="py-20 border-t border-slate-900 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <DemoVideoPlayer />
        </div>
      </section>

      {/* Trust & SAT Security Section (Task A4) */}
      <section id="garantia" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TrustBadges />
        </div>
      </section>

      {/* Social Proof & Testimonials (Task A1) */}
      <section id="testimonios" className="py-20 border-t border-slate-900 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Casos de Éxito en México
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Lo que opinan empresarios que ya cobran a tiempo
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl mx-auto">
              Negocios en Monterrey, CDMX y Guadalajara que transformaron su control financiero y aceleraron su liquidez.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((t) => (
              <div key={t.id} className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6 relative flex flex-col justify-between shadow-xl hover:border-slate-700 transition-colors">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-amber-400 gap-1">
                      {Array.from({ length: t.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-current" />
                      ))}
                    </div>
                    <span className="text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      {t.metricTag}
                    </span>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 mt-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${t.avatarBg} text-white font-bold flex items-center justify-center text-xs shadow-md border border-white/10 shrink-0`}>
                      {t.avatarInitials}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{t.author}</div>
                      <div className="text-xs text-slate-400">{t.role} en <span className="text-slate-300 font-semibold">{t.company}</span></div>
                    </div>
                  </div>

                  <div className="hidden sm:block text-right">
                    <span className="text-[10px] font-mono text-emerald-400 block">{t.location}</span>
                    <span className="text-[10px] text-slate-500">{t.industry}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Calculator Section */}
      <section id="calculadora" className="py-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RoiCalculator />
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precios" className="py-20 border-t border-slate-900 bg-slate-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Planes Transparentes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Sin contratos forzosos. Cancela cuando quieras.
            </h2>
            <p className="text-slate-400 text-sm sm:text-base">
              Precios en pesos mexicanos (MXN). Incluye 14 días de prueba gratis.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Emprendedor Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Emprendedor</h3>
                  <p className="text-xs text-slate-400 mt-1">Ideal para personas físicas y pequeños negocios.</p>
                </div>
                <div className="text-3xl font-black text-white">$299 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Hasta 50 cotizaciones / mes</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Enlaces directos a WhatsApp</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Portal de comprobantes SPEI</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Notas de Venta PDF ilimitadas</li>
                </ul>
              </div>
              <Link href="/onboarding" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs active:scale-95">
                Seleccionar Emprendedor
              </Link>
            </div>

            {/* Negocio Tier (Featured) */}
            <div className="p-8 rounded-3xl bg-indigo-950/40 border-2 border-emerald-500 space-y-6 relative shadow-2xl shadow-emerald-950/40 flex flex-col justify-between">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black tracking-wide uppercase shadow-md">
                Recomendado
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Negocio</h3>
                  <p className="text-xs text-slate-300 mt-1">Para empresas en crecimiento que buscan acelerar cobros.</p>
                </div>
                <div className="text-3xl font-black text-white">$599 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
                <ul className="space-y-3 text-xs text-slate-200">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cotizaciones ilimitadas</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Firma digital OTP con sello SHA-256</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Panel de Cobranza Kanban + Recordatorios</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Score de Salud del Cliente</li>
                </ul>
              </div>
              <Link href="/onboarding" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-md active:scale-95">
                Probar 14 Días Gratis
              </Link>
            </div>

            {/* Empresa Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
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
              </div>
              <Link href="/onboarding" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs active:scale-95">
                Contactar Ventas
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Team / Founders Section (Task A6) */}
      <section id="equipo" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TeamSection />
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Preguntas Frecuentes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Resolvemos tus dudas antes de iniciar
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* Visible Contact Information Block (Task A5) */}
      <section id="contacto" className="py-20 border-t border-slate-900 bg-slate-950/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ContactSection />
        </div>
      </section>

      {/* Bottom Conversion Form Section */}
      <section className="py-20 border-t border-slate-900 bg-linear-to-b from-slate-950 to-emerald-950/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Toma el control de la cobranza de tu negocio hoy mismo
            </h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
              Únete a más de 500 PyMEs en México que ya cotizan y cobran más rápido. 14 días gratis, sin tarjeta de crédito.
            </p>
          </div>

          <div className="max-w-md mx-auto p-6 sm:p-8 rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Nombre de tu Negocio</label>
              <input
                type="text"
                placeholder="ej. Materiales Elizondo"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Correo Electrónico</label>
              <input
                type="email"
                placeholder="contacto@tunegocio.mx"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <Link
              href="/onboarding"
              className="w-full min-h-[54px] py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 text-sm text-center flex items-center justify-center transition-all active:scale-95"
            >
              Crear Mi Cuenta Gratis
            </Link>
            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-800/60">
              <span>✓ Sin tarjeta de crédito</span>
              <span>✓ Cancela cuando quieras</span>
              <span>✓ Soporte WhatsApp</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-xs text-slate-400 border-b border-slate-900 pb-8">
            <div className="flex items-center gap-3">
              <img src="/logo-icon.svg" alt="Business Helper" className="h-8 w-8 object-contain" />
              <div>
                <div className="font-extrabold text-white text-sm">Business Helper S.A.P.I. de C.V.</div>
                <div className="text-slate-400 text-[11px]">{CONTACT_INFO.streetAddress}, {CONTACT_INFO.cityState}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-300">
              <a href={`https://wa.me/${CONTACT_INFO.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>WhatsApp: {CONTACT_INFO.phoneDisplay}</span>
              </a>
              <a href={`mailto:${CONTACT_INFO.email}`} className="hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-emerald-400" />
                <span>{CONTACT_INFO.email}</span>
              </a>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>© 2026 Business Helper S.A.P.I. de C.V. Todos los derechos reservados. San Pedro Garza García, N.L.</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="hover:text-slate-300 transition-colors py-2">
                Aviso de Privacidad (LFPDPPP)
              </Link>
              <Link href="/terms" className="hover:text-slate-300 transition-colors py-2">
                Términos del Servicio
              </Link>
              <Link href="/dashboard" className="hover:text-slate-300 transition-colors py-2">
                Panel de Control
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

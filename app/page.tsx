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
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { RoiCalculator } from '@/components/landing/RoiCalculator';
import { FaqAccordion } from '@/components/landing/FaqAccordion';
import { TrustBadges } from '@/components/landing/TrustBadges';
import { TeamSection } from '@/components/landing/TeamSection';
import { ContactSection } from '@/components/landing/ContactSection';
import { StickyMobileCta } from '@/components/landing/StickyMobileCta';
import { ComparisonSection } from '@/components/landing/ComparisonSection';
import { HealthScoreExplainer } from '@/components/landing/HealthScoreExplainer';
import { BrowserFrameMockup } from '@/components/landing/BrowserFrameMockup';
import { LiveDemoButton } from '@/components/landing/LiveDemoButton';
import { BottomConversionForm } from '@/components/landing/BottomConversionForm';
import { DifferentiatorTimeline } from '@/components/landing/DifferentiatorTimeline';
import { PricingComparisonTable } from '@/components/pricing/PricingComparisonTable';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { getAssetUrl } from '@/lib/url';
import { TESTIMONIALS } from '@/lib/trustData';

export const metadata = {
  title: 'Business Helper | Cotizaciones, Cobranza y CFDI 4.0',
  description:
    'La plataforma todo-en-uno para PyMEs en México. Genera cotizaciones en 2 minutos, envíalas por WhatsApp y mantén el control de quién te debe dinero.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <JsonLd />
      {/* Top Banner Announcement */}
      <div className="bg-linear-to-r from-indigo-700 via-indigo-600 to-emerald-500 text-white text-center py-2.5 px-4 text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2 shadow-md min-h-[48px]">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>⚡ LA PLATAFORMA TODO-EN-UNO PARA PYMES EN MÉXICO — Prueba 14 Días Sin Costo</span>
      </div>

      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG logo; next/image does not optimize SVGs */}
            <img src={getAssetUrl('/logo-icon.svg')} alt="Business Helper" className="h-10 w-10 object-contain" />
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
            <Link href="/dashboard?demo=true" className="hover:text-emerald-400 transition-colors py-2">
              Ver Demo
            </Link>
            <a href="#garantia" className="hover:text-emerald-400 transition-colors py-2">
              Seguridad SAT
            </a>
            <a href="#testimonios" className="hover:text-emerald-400 transition-colors py-2">
              Casos por Industria
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
              href="/register"
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
            {/* Left Copy */}
            <div className="lg:col-span-6 text-center lg:text-left space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-wide uppercase">
                <Zap className="w-3.5 h-3.5" />
                <span>Control Operativo y Financiero para PyMEs</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
                Cobra un 40% más rápido con cotizaciones por WhatsApp y{' '}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 via-teal-300 to-indigo-400">
                  CFDI 4.0 automatizado
                </span>.
              </h1>

              <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                La plataforma todo-en-uno para PyMEs en México. Genera cotizaciones en 2 minutos, envíalas por WhatsApp y timbra facturas SAT sin complicaciones.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link
                  href="/register"
                  className="w-full sm:w-auto min-h-[54px] px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-3 text-base active:scale-95"
                >
                  <span>Probar 14 Días Gratis</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <LiveDemoButton href="/dashboard?demo=true">Ver Demo</LiveDemoButton>
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

              {/* SAT Certificate Security Guarantee Callout (Task A9) */}
              <div className="p-3 px-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5 shadow-sm text-left">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Garantía de Seguridad SAT:</strong> Tus certificados (.cer/.key) se mantienen 100% protegidos en tu PAC. Nunca almacenamos ni leemos tus llaves privadas.</span>
              </div>

              {/* Micro Social Proof Banner (Industry & Roles) */}
              <div className="pt-4 border-t border-slate-900 flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-slate-400">
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                  Construcción • Servicios • Consultoría • Comercio
                </span>
                <span className="font-bold text-slate-200">+500 PyMEs en México</span>
              </div>
            </div>

            {/* Hero Right Visual Mockup (ONLY BrowserFrameMockup) */}
            <div className="lg:col-span-6 flex justify-center w-full">
              <BrowserFrameMockup url="app.businesshelper.app/dashboard">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_02_dashboard_kpis.png')}
                  alt="Dashboard Business Helper — Control de Cotizaciones y Cobranza"
                  className="w-full h-full object-contain object-top bg-slate-950 rounded-b-xl"
                  loading="eager"
                />
              </BrowserFrameMockup>
            </div>
          </div>
        </div>
      </section>

      {/* 5-Step Unique Workflow Timeline */}
      <DifferentiatorTimeline />

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
              <BrowserFrameMockup url="app.businesshelper.app/quotes/new">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_04_quote_wizard_step2.png')}
                  alt="Generador de Cotizaciones Business Helper — Cálculo de Impuestos SAT"
                  className="w-full h-full object-cover object-top rounded-b-xl"
                  loading="lazy"
                />
              </BrowserFrameMockup>
            </div>
          </div>

          {/* Showcase Item 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 lg:order-2 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                02. Aprobación Digital OTP por WhatsApp
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Tu cliente autoriza con código OTP legal desde su celular sin crear cuentas
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Al recibir tu mensaje en WhatsApp, tu cliente abre su propuesta en 1 clic y aprueba con el código que llega a su correo, con evidencia digital de aceptación y fecha certificada.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Aprobación instantánea con código OTP por correo
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Evidencia digital legal respaldada con sello temporal
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Cero fricción: tu cliente no necesita descargar aplicaciones
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 lg:order-1">
              <BrowserFrameMockup url="app.businesshelper.app/q/cotizacion-demo">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_05_signing_otp_modal.png')}
                  alt="Aprobación de Cotización vía OTP y Portal SPEI"
                  className="w-full h-full object-cover object-top rounded-b-xl"
                  loading="lazy"
                />
              </BrowserFrameMockup>
            </div>
          </div>

          {/* Showcase Item 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/20">
                03. Conciliación SPEI Banxico
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Validación de transferencias con Clave de Rastreo SPEI y comprobantes bancarios
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tu cliente adjunta su comprobante SPEI y registra la Clave de Rastreo Banxico directamente desde el portal de la cotización, eliminando confusiones de quién transfirió qué pago.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Carga directa de comprobantes de pago SPEI en PDF o imagen
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Registro de Clave de Rastreo Banxico para consulta CEP
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Notificación automática al recibir el depósito
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6">
              <BrowserFrameMockup url="app.businesshelper.app/spei/portal">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_07_spei_portal.png')}
                  alt="Portal de Validación SPEI Banxico — Business Helper"
                  className="w-full h-full object-cover object-top rounded-b-xl"
                  loading="lazy"
                />
              </BrowserFrameMockup>
            </div>
          </div>

          {/* Showcase Item 4 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 lg:order-2 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                04. Cobranza Visual &ldquo;Quién Me Debe&rdquo;
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Mapa de cartera vencida en tiempo real y score de riesgo crediticio
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Visualiza exactamente qué clientes están al día, quiénes tienen pagos por vencer y cuáles presentan morosidad, con recordatorios automatizados listos para enviar por WhatsApp.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Tablero visual organizado por estatus de cobro
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Confianza de Pago por cliente (0-100) para no dar crédito a ciegas
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Recordatorios de pago por WhatsApp en 1 clic
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 lg:order-1">
              <BrowserFrameMockup url="app.businesshelper.app/receivables">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_06_accounts_receivable.png')}
                  alt="Panel de Cobranza Quién Me Debe — Business Helper"
                  className="w-full h-full object-cover object-top rounded-b-xl"
                  loading="lazy"
                />
              </BrowserFrameMockup>
            </div>
          </div>

          {/* Showcase Item 5 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                05. Facturación SAT CFDI 4.0 & Exportación ZIP
              </span>
              <h3 className="text-3xl font-black text-white tracking-tight">
                Emisión instantánea de facturas electrónicas y descarga 1-Clic para Contador
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Timbra facturas CFDI 4.0 ante el SAT en 1 toque. Al cierre de mes, descarga un paquete ZIP comprimido con tus facturas XML, notas de venta PDF y reportes CSV listo para tu despacho contable.
              </p>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Timbrado oficial CFDI 4.0 certificado (Facturapi PAC Partner)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Paquete ZIP completo listo para enviar por correo a tu contador
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> Resumen estructurado CSV con desglose automático de impuestos
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6">
              <BrowserFrameMockup url="app.businesshelper.app/invoices">
                {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
                <img
                  src={getAssetUrl('/assets/demo/cuj_10_invoices_sat.png')}
                  alt="Timbrado Fiscal CFDI 4.0 SAT — Business Helper"
                  className="w-full h-full object-cover object-top rounded-b-xl"
                  loading="lazy"
                />
              </BrowserFrameMockup>
            </div>
          </div>

        </div>
      </section>

      {/* Trust & SAT Security Section (Task A4) */}
      <section id="garantia" className="py-20 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <TrustBadges />
          <HealthScoreExplainer />
        </div>
      </section>

      {/* Social Proof & Testimonials (Task A1) */}
      <section id="testimonios" className="py-20 border-t border-slate-900 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              Casos de Uso PyME
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Flujos de Trabajo Reales por Industria
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl mx-auto">
              Descubre cómo Business Helper resuelve la cotización rápida, autorizaciones OTP y cobranza SPEI en agencias y servicios.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((t) => (
              <div key={t.id} className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6 relative flex flex-col justify-between shadow-xl hover:border-slate-700 transition-colors">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                      {t.useCaseTitle || t.company}
                    </span>
                    <span className="text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {t.metricTag}
                    </span>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 mt-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${t.avatarBg || 'bg-emerald-600'} text-white font-black text-xs flex items-center justify-center shadow-md shrink-0 border border-white/10`}>
                      {t.avatarInitials}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {t.personaLabel}
                      </div>
                      <div className="text-[11px] text-slate-400">{t.industry}</div>
                    </div>
                  </div>

                  <div className="hidden sm:block text-right">
                    <span className="text-[10px] font-mono text-emerald-400 block">{t.location}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Side-by-Side Competitor Comparison Section (Task F3) */}
          <ComparisonSection />
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
            {/* Inicial Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Plan Inicial</h3>
                  <p className="text-xs text-slate-400 mt-1">Ideal para microempresas, freelancers y servicios profesionales.</p>
                </div>
                <div className="text-3xl font-black text-white">$299 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Hasta 50 cotizaciones / mes</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Enlaces directos a WhatsApp</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Portal de comprobantes SPEI</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Firma de cotizaciones vía OTP</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Timbrado CFDI 4.0 con tu propio PAC (Facturapi)</li>
                </ul>
              </div>
              <Link href="/upgrade?plan=starter" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs active:scale-95">
                Probar 14 Días Gratis
              </Link>
            </div>

            {/* Negocio Tier (Featured) */}
            <div className="p-8 rounded-3xl bg-indigo-950/40 border-2 border-emerald-500 space-y-6 relative shadow-2xl shadow-emerald-950/40 flex flex-col justify-between">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black tracking-wide uppercase shadow-md">
                Recomendado
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Plan Negocio</h3>
                  <p className="text-xs text-slate-300 mt-1">Para PyMEs en crecimiento que buscan acelerar cobros.</p>
                </div>
                <div className="text-3xl font-black text-white">$599 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
                <ul className="space-y-3 text-xs text-slate-200">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Cotizaciones ilimitadas</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Timbrado CFDI 4.0 con tu propio PAC (Facturapi)</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Firma digital OTP con evidencia legal</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Tablero de Cobranza + Recordatorios</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Confianza de Pago</li>
                </ul>
              </div>
              <Link href="/upgrade?plan=pro" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-md active:scale-95">
                Probar 14 Días Gratis
              </Link>
            </div>

            {/* Empresa Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Plan Empresa</h3>
                  <p className="text-xs text-slate-400 mt-1">Para empresas consolidadas, corporativos y multi-sucursal.</p>
                </div>
                <div className="text-3xl font-black text-white">$999 <span className="text-sm font-semibold text-slate-400">MXN / mes</span></div>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Todo lo del plan Negocio</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Timbrado CFDI 4.0 con tu propio PAC (Facturapi)</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Descarga 1-click ZIP para Contador</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Roles de equipo y Multi-sucursal</li>
                </ul>
              </div>
              <Link href="/upgrade?plan=business" className="min-h-[48px] flex items-center justify-center text-center w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs active:scale-95">
                Probar 14 Días Gratis
              </Link>
            </div>
          </div>

          {/* Side-by-Side Feature Comparison Table */}
          <div className="mt-16">
            <PricingComparisonTable />
          </div>

          {/* CFDI Add-on & SAT CSD Trust Guarantee Callout */}
          <div className="mt-12 p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="space-y-1">
              <div className="flex items-center justify-center md:justify-start gap-2 text-emerald-400 text-sm font-bold">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Garantía de Seguridad SAT: Nunca Almacenamos tus Certificados</span>
              </div>
              <p className="text-xs text-slate-300">
                Tus certificados digitales (.cer/.key) se mantienen 100% seguros con tu PAC de confianza (Facturapi, Facturama, FiscalAPI). Nosotros solo enviamos los datos de la factura.
              </p>
            </div>
            <div className="shrink-0 text-xs bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 text-slate-200">
              <span className="font-bold text-emerald-400">Timbrado CFDI 4.0:</span> disponible en todos los planes con tu propio PAC
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

          <BottomConversionForm />
        </div>
      </section>

      {/* Footer Component */}
      <Footer />

      {/* Floating Mobile Sticky CTA */}
      <StickyMobileCta />
    </div>
  );
}

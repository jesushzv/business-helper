'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Sparkles, Zap, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { FaqAccordion } from '@/components/landing/FaqAccordion';
import { getAssetUrl } from '@/lib/url';

const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Plan Inicial',
    description: 'Ideal para microempresas, freelancers y servicios profesionales.',
    price: '$299',
    period: 'MXN / mes',
    featured: false,
    badge: 'Cobranza Básica',
    features: [
      'Hasta 50 cotizaciones al mes',
      'Facturación CFDI 4.0 con Timbrado PAC',
      'Envío interactivo por WhatsApp',
      'Validación de comprobantes SPEI',
      'Firma de cotizaciones vía OTP',
      '1 usuario administrador',
    ],
    ctaText: 'Empezar Prueba 14 Días',
    ctaHref: '/register?plan=starter',
  },
  {
    id: 'pro',
    name: 'Plan Negocio',
    description: 'Para PyMEs en crecimiento con equipo comercial y cobranza activa.',
    price: '$599',
    period: 'MXN / mes',
    featured: true,
    badge: 'Más Popular — Recomendado',
    features: [
      'Cotizaciones ILIMITADAS',
      'Facturación CFDI 4.0 ilimitada',
      'Conciliación automática SPEI Banxico',
      'Firma digital OTP con evidencia legal',
      'Reportes de cobranza & score de clientes',
      'Hasta 5 usuarios colaboradores',
      'Soporte prioritario WhatsApp 24/7',
    ],
    ctaText: 'Probar Gratis 14 Días',
    ctaHref: '/register?plan=pro',
  },
  {
    id: 'business',
    name: 'Plan Empresa',
    description: 'Para empresas consolidadas, corporativos y negocios multi-sucursal.',
    price: '$999',
    period: 'MXN / mes',
    featured: false,
    badge: 'Multi-sucursal',
    features: [
      'Todo lo del Plan Negocio',
      'Usuarios e integrantes ILIMITADOS',
      'Acceso multi-tenant y sucursales',
      'Exportación automática 1-Clic para Contador (ZIP)',
      'Capacitación personal por videollamada',
      'Gerente de cuenta dedicado',
    ],
    ctaText: 'Solicitar Plan Empresa',
    ctaHref: '/register?plan=business',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/15 via-indigo-900/10 to-transparent pointer-events-none" />

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

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16 relative z-10">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3.5 py-1.5 rounded-full border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Precios Transparentes para PyMEs en México
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Elige el plan ideal para automatizar tus cotizaciones y cobranza
          </h1>
          <p className="text-slate-400 text-base sm:text-lg leading-relaxed">
            Sin plazos forzosos. Sin costos ocultos. Todos los planes incluyen 14 días de prueba gratis con acceso completo.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`p-8 rounded-3xl flex flex-col justify-between space-y-8 relative transition-all ${
                plan.featured
                  ? 'bg-slate-900 border-2 border-emerald-500/80 shadow-2xl shadow-emerald-500/10 scale-105 z-10'
                  : 'bg-slate-900/60 border border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider shadow-md">
                  {plan.badge}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{plan.description}</p>
                </div>

                <div className="border-y border-slate-800/80 py-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white tracking-tight">{plan.price}</span>
                    <span className="text-xs font-bold text-slate-400">{plan.period}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold block mt-1">✓ Incluye CFDI 4.0 & WhatsApp</span>
                </div>

                <ul className="space-y-3 text-xs text-slate-300">
                  {plan.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={plan.ctaHref}
                className={`w-full min-h-[48px] py-3.5 px-4 rounded-xl text-xs font-extrabold text-center flex items-center justify-center gap-2 transition-all ${
                  plan.featured
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 active:scale-95'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 active:scale-95'
                }`}
              >
                <span>{plan.ctaText}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>

        {/* SAT & Security Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Garantía de Seguridad SAT & PAC</h3>
              <p className="text-xs text-slate-400 mt-1">
                Nunca almacenamos tus certificados SAT (.cer/.key) ni contraseñas de CSD en nuestros servidores. Facturación procesada a través de Proveedor Autorizado de Certificación (PAC) autorizado por el SAT.
              </p>
            </div>
          </div>
          <Link
            href="/register"
            className="min-h-[48px] px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shrink-0 flex items-center gap-2 transition-all"
          >
            <Zap className="w-4 h-4" />
            <span>Crear Cuenta Gratis</span>
          </Link>
        </div>

        {/* FAQ Section */}
        <div className="space-y-6 pt-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              <HelpCircle className="w-4 h-4" />
              Dudas Frecuentes de Facturación & Cobranza
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Preguntas Frecuentes de Precios</h2>
          </div>
          <FaqAccordion />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-center text-xs text-slate-400 mt-16">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© 2026 Business Helper S.A.P.I. de C.V. Todos los derechos reservados.</span>
          <div className="flex items-center gap-4 text-slate-400">
            <Link href="/privacy" className="hover:text-white transition-colors">Aviso de Privacidad</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Términos del Servicio</Link>
            <Link href="/" className="hover:text-white transition-colors">Página Principal</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

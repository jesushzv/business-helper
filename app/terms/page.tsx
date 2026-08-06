import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'Términos y Condiciones — Business Helper',
  description: 'Términos y Condiciones de Uso del servicio Business Helper SaaS en México.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors py-2 px-3 rounded-lg hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium text-sm">Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Shield className="w-5 h-5" />
            <span>Business Helper México</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-4 border-b border-slate-800 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5" />
            Términos del Servicio SaaS
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Términos y Condiciones de Uso
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Última actualización: 31 de julio de 2026. Aplica a todas las cuentas y suscripciones de Business Helper.
          </p>
        </div>

        <section className="space-y-6 text-slate-300 text-sm leading-relaxed sm:text-base">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              1. Aceptación de los Términos
            </h2>
            <p>
              Al registrar una cuenta, acceder o utilizar la plataforma <strong>Business Helper</strong>, usted acepta cumplir y quedar obligado por los presentes Términos y Condiciones. Si no está de acuerdo con estos términos, no deberá acceder ni utilizar nuestros servicios.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              2. Descripción del Servicio
            </h2>
            <p>
              Business Helper es una solución de software como servicio (SaaS) diseñada para PyMEs en México. Facilita la creación de cotizaciones profesionales con desglose de impuestos SAT, gestión visual de cuentas por cobrar (*Quién me debe*), firma digital mediante OTP y recepción de comprobantes de pago SPEI.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              3. Suscripciones y Pagos
            </h2>
            <p>
              Los planes de suscripción ($299 MXN Inicial, $599 MXN Negocio, $999 MXN Empresa) se cobran de manera recurrente a través de la pasarela Stripe. Usted puede cancelar su suscripción en cualquier momento desde el panel de configuración.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              4. Responsabilidad Fiscal y Legal
            </h2>
            <p>
              Business Helper calcula estimaciones de IVA y retenciones fiscales conforme a las reglas del SAT vigentes al momento de la cotización. El usuario es responsable de verificar la precisión de sus datos fiscales y la idoneidad legal de sus contratos comerciales.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-400" />
              5. Política de Cancelación y Reembolso
            </h2>
            <p>
              El usuario puede cancelar su suscripción a <strong>Business Helper</strong> en cualquier momento y sin penalizaciones desde su panel de configuración o enviando una solicitud a <a href="mailto:soporte@businesshelper.app" className="text-indigo-400 underline">soporte@businesshelper.app</a>.
            </p>
            <p>
              Al solicitar la cancelación, el acceso a las funciones de su plan se mantendrá activo hasta el final del periodo mensual ya pagado. No se realizan reembolsos proporcionales por días no utilizados dentro del ciclo de facturación activo.
            </p>
          </div>
        </section>

        {/* Footer Link */}
        <div className="pt-8 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <p>© 2026 Business Helper. Todos los derechos reservados.</p>
          <Link href="/privacy" className="text-indigo-400 hover:underline">
            Aviso de Privacidad
          </Link>
        </div>
      </main>
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Lock, FileText, CheckCircle } from 'lucide-react';

export const metadata = {
  title: 'Aviso de Privacidad — Business Helper',
  description: 'Aviso de Privacidad conforme a la LFPDPPP en México. Protección de datos personales y financieros para usuarios de Business Helper.',
};

export default function PrivacyPage() {
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
            <Lock className="w-3.5 h-3.5" />
            Cumplimiento LFPDPPP México
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Aviso de Privacidad Integral
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Última actualización: 31 de julio de 2026. Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </p>
        </div>

        <section className="space-y-6 text-slate-300 text-sm leading-relaxed sm:text-base">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              1. Identidad y Domicilio del Responsable
            </h2>
            <p>
              <strong>Business Helper S.A.P.I. de C.V.</strong> (en lo sucesivo &quot;Business Helper&quot;), con domicilio en Tijuana, B.C., México / San Diego, CA, es el responsable del tratamiento y protección de sus datos personales y financieros recolectados a través de nuestra plataforma web y aplicación móvil.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              2. Datos Personales Recabados
            </h2>
            <p>Para la prestación de nuestros servicios de cotizaciones, gestión de cobranza y firma digital OTP, recabamos:</p>
            <ul className="list-disc pl-5 space-y-2 text-slate-300">
              <li><strong>Datos de Identificación y Contacto:</strong> Nombre completo, razón social, correo electrónico, número celular (WhatsApp), RFC (Registro Federal de Contribuyentes) y domicilio fiscal.</li>
              <li><strong>Datos de Transacciones Financieras:</strong> Comprobantes de transferencia SPEI, Claves de Rastreo Banxico, montos de cotización e historial de pagos de clientes.</li>
              <li><strong>Datos Técnicos y de Seguridad:</strong> Dirección IP, sellos de seguridad de la firma digital de cotizaciones y registros de auditoría de inicio de sesión.</li>
            </ul>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-indigo-400" />
              3. Finalidades del Tratamiento
            </h2>
            <p>Sus datos personales serán utilizados para las siguientes finalidades primarias y necesarias:</p>
            <ol className="list-decimal pl-5 space-y-2 text-slate-300">
              <li>Generación y envío de propuestas comerciales y cotizaciones con cálculo automático de impuestos SAT (IVA 16%, retenciones ISR e IVA).</li>
              <li>Envío de recordatorios automáticos de cobro a través de enlaces directos a WhatsApp.</li>
              <li>Validación y verificación de comprobantes de pago SPEI cargados por sus clientes.</li>
              <li>Autenticación de firma digital mediante código OTP de 6 dígitos con sellado de tiempo criptográfico.</li>
              <li>Procesamiento de suscripciones SaaS a través de pasarelas de pago seguras (Stripe).</li>
            </ol>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              4. Medidas de Seguridad y Derechos ARCO
            </h2>
            <p>
              Business Helper implementa políticas de seguridad con la información de cada negocio aislada de la de los demás dentro de la base de datos, cifrado de la información mientras viaja por internet y también mientras está guardada.
            </p>
            <p>
              Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los utilizamos y las condiciones del uso que les damos (Acceso). Asimismo, es su derecho solicitar la corrección de su información personal (Rectificación); que la eliminemos de nuestros registros (Cancelación); así como oponerse al uso de sus datos para fines específicos (Oposición).
            </p>
            <p className="text-slate-400 text-sm">
              Para ejercer cualquiera de los derechos ARCO, puede enviar una solicitud formal a nuestro Departamento de Privacidad al correo: <a href="mailto:privacidad@businesshelper.app" className="text-indigo-400 underline">privacidad@businesshelper.app</a>.
            </p>
          </div>
        </section>

        {/* Footer Link */}
        <div className="pt-8 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <p>© 2026 Business Helper. Todos los derechos reservados.</p>
          <Link href="/terms" className="text-indigo-400 hover:underline">
            Términos y Condiciones
          </Link>
        </div>
      </main>
    </div>
  );
}

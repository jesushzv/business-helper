import React from 'react';
import {
  FileText,
  MessageSquare,
  Smartphone,
  Building2,
  FileCheck,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export const STEPS = [
  {
    step: '01',
    title: 'Crear Cotización',
    time: '2 minutos',
    icon: FileText,
    badge: '100% Celular',
    description:
      'Cotizaciones profesionales en 2 minutos con catálogo de productos y cálculo automático de IVA y retenciones.',
  },
  {
    step: '02',
    title: 'Enviar por WhatsApp',
    time: '1 clic',
    icon: MessageSquare,
    badge: 'Sin PDF pesado',
    description:
      'Tu cliente recibe un enlace limpio por WhatsApp sin descargar archivos. Compatible con iPhone y Android.',
  },
  {
    step: '03',
    title: 'Cliente Aprueba con OTP',
    time: '30 segundos',
    icon: Smartphone,
    badge: 'Evidencia legal certificada',
    description:
      'Aprobación digital mediante código OTP al celular. Sin contraseñas complicadas ni papeles firmados a mano.',
  },
  {
    step: '04',
    title: 'Confirmación SPEI',
    time: 'Automático',
    icon: Building2,
    badge: 'Conciliación en tiempo real',
    description:
      'Recibe notificaciones inmediatas al acreditarse el pago por transferencia bancaria con Clave de Rastreo Banxico.',
  },
  {
    step: '05',
    title: 'Timbrado CFDI 4.0',
    time: '1 clic',
    icon: FileCheck,
    badge: 'Cumplimiento SAT 100%',
    description:
      'Generación automática de factura CFDI 4.0 vinculada a la cotización aprobada, lista para exportación a tu contador.',
  },
];

export function DifferentiatorTimeline() {
  return (
    <section className="py-20 bg-slate-950 relative overflow-hidden border-b border-slate-800/80">
      {/* Background Decorative Gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[350px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
            <CheckCircle2 className="w-4 h-4" />
            Flujo Unico Operativo para PyMEs
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            De la cotización a la factura fiscal en{' '}
            <span className="bg-linear-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              5 pasos automatizados
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-base sm:text-lg">
            Unificamos cotizaciones, cobranza por WhatsApp y timbrado CFDI 4.0 en una sola plataforma diseñada para negocios en México.
          </p>
        </div>

        {/* Timeline Desktop Grid / Mobile Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="group relative bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 flex flex-col justify-between"
              >
                <div>
                  {/* Top Step Pill */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                      PASO {s.step}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                      ⚡ {s.time}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/40 transition-all">
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Title & Badge */}
                  <h3 className="text-base font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                    {s.title}
                  </h3>
                  <div className="text-[11px] font-semibold text-indigo-400 mb-3">
                    {s.badge}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {s.description}
                  </p>
                </div>

                {/* Arrow Connector (Desktop only, except last) */}
                {idx < STEPS.length - 1 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-400 items-center justify-center">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

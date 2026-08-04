'use client';

import React from 'react';
import { Check, X, Sparkles } from 'lucide-react';

export function ComparisonSection() {
  const comparisonRows = [
    {
      feature: 'Tiempo por Cotización',
      bh: '2 minutos (Cálculo automático de IVA 16% e ISR)',
      manual: '15–30 min (Edición manual en Excel)',
      traditional: '20+ min (Módulo complejo en PC de escritorio)',
    },
    {
      feature: 'Envíos y Seguimiento WhatsApp',
      bh: '1-Tap Directo (enlace wa.me con vista previa)',
      manual: 'Manual (descargar y adjuntar PDF)',
      traditional: 'No (solo envío por correo interno)',
    },
    {
      feature: 'Firma Legal & Aceptación OTP',
      bh: 'Sí (Sello Cryptoseal SHA-256 sin registro del cliente)',
      manual: 'No (mensajes informales en chat)',
      traditional: 'No (requiere impresión o firma física)',
    },
    {
      feature: 'Portal SPEI Banxico & Comprobantes',
      bh: 'Sí (Validación de Clave de Rastreo en tiempo real)',
      manual: 'No (comprobantes perdidos en chats)',
      traditional: 'No (conciliación manual en banca en línea)',
    },
    {
      feature: 'Score de Salud del Cliente (0–100)',
      bh: 'Sí (Evaluación automática de riesgo crediticio PyME)',
      manual: 'No (basado en memoria o corazonadas)',
      traditional: 'No (reportes estáticos de antigüedad de saldos)',
    },
    {
      feature: 'Timbrado CFDI 4.0 PAC',
      bh: 'Sí (Integración PAC Facturapi, $2–$5 MXN/folio)',
      manual: 'No (sitio SAT lento o sin PAC)',
      traditional: 'Licencias costosas ($15,000+ MXN/año o sin CFDI)',
    },
    {
      feature: 'Precio & Modelo de Licencia',
      bh: '$299–$999 MXN/mes (Por empresa, usuarios ilimitados)',
      manual: 'Gratis (pero cuesta 20 hrs/mes en horas trabajo)',
      traditional: 'Prayser/Flexio ($1,199–$3,000+ MXN) u Odoo ($20-$50 USD/user)',
    },
    {
      feature: 'Implementación & Curva de Aprendizaje',
      bh: '< 10 minutos (Self-Serve 100% Celular)',
      manual: 'Caótico (archivos duplicados o desactualizados)',
      traditional: '3–6 semanas (Requiere consultor o técnico)',
    },
  ];

  return (
    <div className="space-y-8 text-left">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Comparativa Directa de Mercado</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          ¿Por qué las PyMEs eligen Business Helper?
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm">
          Compara cómo nos diferenciamos frente a Excel, sistemas tradicionales de escritorio (CONTPAQi/Aspel) y ERPs complejos (Odoo/Prayser/Flexio).
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80">
              <th className="p-4 sm:p-6 font-bold text-slate-400 w-1/4">Característica / Función</th>
              <th className="p-4 sm:p-6 font-black text-emerald-400 bg-emerald-500/10 border-x border-emerald-500/20 w-1/4 text-center">
                Business Helper
              </th>
              <th className="p-4 sm:p-6 font-bold text-slate-300 w-1/4 text-center">
                Excel / WhatsApp Manual
              </th>
              <th className="p-4 sm:p-6 font-bold text-slate-300 w-1/4 text-center">
                Sistemas Tradicionales (Prayser / CONTPAQi / Odoo)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {comparisonRows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-900/40 transition-colors">
                <td className="p-4 sm:p-5 font-bold text-white flex items-center gap-2">
                  <span>{row.feature}</span>
                </td>
                <td className="p-4 sm:p-5 font-bold text-emerald-400 bg-emerald-500/5 border-x border-emerald-500/20 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{row.bh}</span>
                  </div>
                </td>
                <td className="p-4 sm:p-5 text-slate-400 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <X className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{row.manual}</span>
                  </div>
                </td>
                <td className="p-4 sm:p-5 text-slate-400 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <X className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{row.traditional}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

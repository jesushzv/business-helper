'use client';

import React from 'react';
import { Check, X, Sparkles } from 'lucide-react';

export function ComparisonSection() {
  const comparisonRows = [
    {
      feature: 'Cotizaciones en 2 minutos',
      bh: 'Sí (plantillas WhatsApp y PDF 1-click)',
      manual: 'No (15–30 min editando Excel)',
      traditional: 'No (proceso complejo en PC desktop)',
    },
    {
      feature: 'Envíos por WhatsApp Directo',
      bh: 'Sí (enlace wa.me pre-llenado)',
      manual: 'Manual (adjuntar archivo PDF manualmente)',
      traditional: 'No (solo envío por correo interno)',
    },
    {
      feature: 'Portal SPEI con Firma OTP',
      bh: 'Sí (sello digital SHA-256 e historial)',
      manual: 'No (chats perdidos en WhatsApp)',
      traditional: 'No (validación manual bancaria)',
    },
    {
      feature: 'Score de Salud del Cliente',
      bh: 'Sí (algoritmo 0–100 de riesgo crediticio)',
      manual: 'No (memoria o corazonada)',
      traditional: 'No (reportes estáticos de antigüedad)',
    },
    {
      feature: 'Timbrado CFDI 4.0 PAC',
      bh: 'Sí ($2–$5 MXN/folio sin bloqueos)',
      manual: 'No (sitio SAT lento o sin PAC)',
      traditional: 'Sí ($15,000+ MXN licencias anuales)',
    },
    {
      feature: 'Uso 100% desde Celular',
      bh: 'Sí (diseñado para iPhone y Android)',
      manual: 'Incómodo (hojas de cálculo en pantalla chica)',
      traditional: 'No (requiere Windows PC y red local)',
    },
  ];

  return (
    <div className="space-y-8 text-left">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Comparativa Directa</span>
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          ¿Por qué las PyMEs eligen Business Helper?
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm">
          Compara cómo se diferencia nuestra solución frente al trabajo manual en Excel o los sistemas tradicionales pesados.
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
                Sistemas Tradicionales (CONTPAQi / Aspel / Prayser)
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

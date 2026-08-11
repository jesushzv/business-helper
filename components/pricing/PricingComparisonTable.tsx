import React from 'react';
import { Check, X } from 'lucide-react';

export function PricingComparisonTable() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          Comparativa de Funcionalidades
        </span>
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Compara todas las características lado a lado
        </h3>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/90 text-white">
              <th className="p-4 sm:p-5 font-extrabold text-sm w-1/3">Características</th>
              <th className="p-4 sm:p-5 text-center font-extrabold text-sm text-slate-300">
                Plan Inicial
                <span className="block text-[11px] font-medium text-emerald-400">$299 MXN/mes</span>
              </th>
              <th className="p-4 sm:p-5 text-center font-extrabold text-sm text-emerald-400 bg-emerald-950/30 border-x border-emerald-500/20">
                Plan Negocio
                <span className="block text-[11px] font-medium text-emerald-300">$599 MXN/mes</span>
              </th>
              <th className="p-4 sm:p-5 text-center font-extrabold text-sm text-indigo-400">
                Plan Empresa
                <span className="block text-[11px] font-medium text-indigo-300">$999 MXN/mes</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {/* Row 1 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Cotizaciones al mes</td>
              <td className="p-4 sm:p-5 text-center font-semibold">50 / mes</td>
              <td className="p-4 sm:p-5 text-center font-extrabold text-emerald-400 bg-emerald-950/20 border-x border-emerald-500/20">
                ILIMITADAS
              </td>
              <td className="p-4 sm:p-5 text-center font-extrabold text-indigo-400">ILIMITADAS</td>
            </tr>
            {/* Row 2 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Usuarios colaboradores</td>
              <td className="p-4 sm:p-5 text-center">1 Usuario</td>
              <td className="p-4 sm:p-5 text-center font-semibold text-emerald-400 bg-emerald-950/20 border-x border-emerald-500/20">
                5 Usuarios
              </td>
              <td className="p-4 sm:p-5 text-center font-extrabold text-indigo-400">ILIMITADOS</td>
            </tr>
            {/* Row 3 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Folios CFDI 4.0 incluidos</td>
              <td className="p-4 sm:p-5 text-center text-slate-400">0 folios (opcional)</td>
              <td className="p-4 sm:p-5 text-center font-bold text-emerald-400 bg-emerald-950/20 border-x border-emerald-500/20">
                10 folios / mes
              </td>
              <td className="p-4 sm:p-5 text-center font-bold text-indigo-400">50 folios / mes</td>
            </tr>
            {/* Row 4 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Costo por folio adicional</td>
              <td className="p-4 sm:p-5 text-center">$5 MXN</td>
              <td className="p-4 sm:p-5 text-center font-bold text-emerald-400 bg-emerald-950/20 border-x border-emerald-500/20">
                $3 MXN
              </td>
              <td className="p-4 sm:p-5 text-center font-bold text-indigo-400">$2 MXN</td>
            </tr>
            {/* Row 5 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Firma OTP por WhatsApp</td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
            {/* Row 6 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Conciliación SPEI Banxico</td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
            {/* Row 7 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Health Score de Clientes</td>
              <td className="p-4 sm:p-5 text-center"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
            {/* Row 8 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Exportación 1-Clic para Contador (ZIP)</td>
              <td className="p-4 sm:p-5 text-center"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><Check className="w-4 h-4 text-emerald-400 mx-auto" /></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
            {/* Row 9 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Acceso Multi-sucursal & Roles de Equipo</td>
              <td className="p-4 sm:p-5 text-center"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
            {/* Row 10 */}
            <tr className="hover:bg-slate-800/30 transition-colors">
              <td className="p-4 sm:p-5 font-bold text-white">Soporte Prioritario VIP & Capacitación de Equipo</td>
              <td className="p-4 sm:p-5 text-center"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center bg-emerald-950/20 border-x border-emerald-500/20"><><X className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" /><span className="sr-only">No incluido</span></></td>
              <td className="p-4 sm:p-5 text-center"><Check className="w-4 h-4 text-indigo-400 mx-auto" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

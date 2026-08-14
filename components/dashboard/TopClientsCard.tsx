'use client';

import React from 'react';
import Link from 'next/link';
import { Award, MessageSquare, ArrowUpRight } from 'lucide-react';
import { TopClientRevenue } from '@/lib/dashboardAnalytics';
import { generateWhatsAppLink, buildClientGreeting } from '@/lib/whatsappLink';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { formatMXN } from '@/lib/currencyFormat';

interface TopClientsCardProps {
  topClients: TopClientRevenue[];
  /**
   * Whether the org has clients at all. An empty leaderboard now means "no
   * confirmed revenue" (#277 filters $0 rows out), and "registra a tu primer
   * cliente" is the wrong advice for a tenant with three clients who simply
   * haven't paid yet — the two absences get their own copy.
   */
  hasClients?: boolean;
}

export const TopClientsCard: React.FC<TopClientsCardProps> = ({ topClients, hasClients = true }) => {
  const { org } = useCurrentOrg();
  // `null` = no score on record (#276): named as such, never scored as 100.
  const getHealthBadge = (score: number | null) => {
    if (score === null)
      return { label: 'Sin historial', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    if (score >= 90) return { label: 'Excelente', bg: 'bg-emerald-950 text-emerald-400 border-emerald-500/30' };
    if (score >= 70) return { label: 'Bueno', bg: 'bg-teal-950 text-teal-300 border-teal-500/30' };
    if (score >= 50) return { label: 'Regular', bg: 'bg-amber-950 text-amber-300 border-amber-500/30' };
    return { label: 'Riesgo', bg: 'bg-rose-950 text-rose-400 border-rose-500/30' };
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold tracking-tight text-white">
              Top Clientes por Facturación
            </h3>
            <p className="text-xs text-slate-400">Ranking de cuentas clave con mayor volumen cobrado</p>
          </div>
        </div>

        <Link
          href="/clients"
          className="flex min-h-[48px] items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span>Ver directorio</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {topClients.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          {hasClients
            ? 'No hay ingresos confirmados registrados aún. Cuando confirmes tu primer pago, tus mejores clientes aparecerán aquí.'
            : 'Todavía no tienes clientes registrados. Registra el primero para empezar a cotizar y cobrar.'}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {topClients.map((client, rank) => {
            const badge = getHealthBadge(client.health_score);
            const waLink = generateWhatsAppLink(
              client.phone,
              `${buildClientGreeting(client.contact_name || client.name, org?.name)} Le escribo para darle seguimiento a nuestros servicios.`
            );

            return (
              <div
                key={client.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:bg-slate-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-slate-950 shadow-md">
                    #{rank + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-white">{client.name}</h4>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${badge.bg}`}>
                        {badge.label}
                        {client.health_score !== null && ` (${client.health_score} pt)`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {client.contact_name ? `${client.contact_name} • ` : ''}
                      {client.confirmedMilestonesCount} pagos confirmados
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-slate-800 pt-2 sm:border-t-0 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-slate-400">Total Cobrado</p>
                    <p className="font-mono text-base font-black text-emerald-400">
                      {formatMXN(client.totalRevenue)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {client.phone && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-emerald-500 p-2.5 text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95"
                        title="Enviar WhatsApp"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </a>
                    )}
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex min-h-[48px] items-center rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 shadow-sm hover:bg-slate-700 hover:text-white"
                    >
                      Perfil
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import { Award, MessageSquare, ArrowUpRight } from 'lucide-react';
import { TopClientRevenue } from '@/lib/dashboardAnalytics';
import { generateWhatsAppLink } from '@/lib/whatsappLink';

interface TopClientsCardProps {
  topClients: TopClientRevenue[];
}

export const TopClientsCard: React.FC<TopClientsCardProps> = ({ topClients }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(val);
  };

  const getHealthBadge = (score: number) => {
    if (score >= 90) return { label: 'Excelente', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    if (score >= 70) return { label: 'Bueno', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    if (score >= 50) return { label: 'Regular', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    return { label: 'Riesgo', bg: 'bg-red-100 text-red-800 border-red-200' };
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold tracking-tight text-gray-900">
              Top Clientes por Facturación
            </h3>
            <p className="text-xs text-gray-500">Ranking de cuentas clave con mayor volumen cobrado</p>
          </div>
        </div>

        <Link
          href="/clients"
          className="flex min-h-[48px] items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
        >
          <span>Ver directorio</span>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {topClients.length === 0 ? (
        <div className="py-8 text-center text-xs text-gray-500">
          No hay ingresos confirmados registrados aún.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {topClients.map((client, rank) => {
            const badge = getHealthBadge(client.health_score);
            const waLink = generateWhatsAppLink(
              client.phone,
              `Hola ${client.contact_name || client.name}, le saluda Don Roberto. Le escribo para darle seguimiento a nuestros servicios.`
            );

            return (
              <div
                key={client.id}
                className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-all hover:bg-gray-100/80 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white shadow-xs">
                    #{rank + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-gray-900">{client.name}</h4>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${badge.bg}`}>
                        {badge.label} ({client.health_score} pt)
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {client.contact_name ? `${client.contact_name} • ` : ''}
                      {client.confirmedMilestonesCount} pagos confirmados
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-gray-200/60 pt-2 sm:border-t-0 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-gray-400">Total Cobrado</p>
                    <p className="text-base font-black text-emerald-600">
                      {formatCurrency(client.totalRevenue)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {client.phone && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-emerald-500 p-2.5 text-white shadow-xs transition-all hover:bg-emerald-600 active:scale-95"
                        title="Enviar WhatsApp"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </a>
                    )}
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex min-h-[48px] items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-xs hover:bg-indigo-50 hover:text-indigo-600"
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

'use client';

import React from 'react';
import Link from 'next/link';
import { MessageSquare, Phone, Building2, UserCheck, ChevronRight } from 'lucide-react';
import { Client } from '@/types';
import { HealthScoreMeter } from './HealthScoreMeter';
import { generateWhatsAppLink } from '@/lib/whatsappLink';

interface ClientCardProps {
  client: Client;
  onEdit?: (client: Client) => void;
}

export const ClientCard: React.FC<ClientCardProps> = ({ client }) => {
  const waMessage = `Hola ${client.contact_name || client.name}, un gusto saludarte de Distribuidora del Norte.`;
  const whatsappUrl = generateWhatsAppLink(client.phone, waMessage);

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl transition-all hover:border-slate-700 text-white">
      {/* Top Header info */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-950/80 font-bold text-indigo-400 border border-indigo-500/30">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/clients/${client.id}`}
                className="text-base font-extrabold text-white transition-colors hover:text-emerald-400 focus:outline-none block truncate"
              >
                {client.name}
              </Link>
              {client.contact_name && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 truncate">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{client.contact_name}</span>
                </div>
              )}
            </div>
          </div>
          <HealthScoreMeter score={client.health_score ?? 100} compact />
        </div>

        {/* SAT Tax Meta */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-lg bg-slate-950 px-2.5 py-1 font-mono font-bold text-slate-200 border border-slate-800">
            RFC: {client.rfc || 'Sin RFC'}
          </span>
          {client.regimen_fiscal && (
            <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 border border-slate-700">
              Régimen {client.regimen_fiscal}
            </span>
          )}
          {client.codigo_postal && (
            <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-slate-300 border border-slate-700">
              CP {client.codigo_postal}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Action Footer (Don Roberto constraint: 1-tap WhatsApp button >= 48px) */}
      <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
        {client.phone ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-emerald-950/40 transition-all"
            aria-label={`Enviar WhatsApp a ${client.name}`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>WhatsApp Directo</span>
          </a>
        ) : (
          <div className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 px-4 py-2.5 text-xs text-slate-500">
            <Phone className="h-4 w-4" />
            <span>Sin teléfono</span>
          </div>
        )}

        <Link
          href={`/clients/${client.id}`}
          className="ml-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Ver Perfil"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
};

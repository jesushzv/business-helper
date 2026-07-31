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
    <div className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md">
      {/* Top Header info */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-700">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <Link
                href={`/clients/${client.id}`}
                className="text-base font-extrabold text-gray-900 transition-colors hover:text-indigo-600 focus:outline-none"
              >
                {client.name}
              </Link>
              {client.contact_name && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <UserCheck className="h-3.5 w-3.5 text-gray-400" />
                  <span>{client.contact_name}</span>
                </div>
              )}
            </div>
          </div>
          <HealthScoreMeter score={client.health_score ?? 100} compact />
        </div>

        {/* SAT Tax Meta */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono font-bold text-gray-700">
            RFC: {client.rfc || 'Sin RFC'}
          </span>
          {client.regimen_fiscal && (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-gray-600">
              Régimen {client.regimen_fiscal}
            </span>
          )}
          {client.codigo_postal && (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-gray-600">
              CP {client.codigo_postal}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Action Footer (Don Roberto constraint: 1-tap WhatsApp button >= 48px) */}
      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        {client.phone ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-95"
            aria-label={`Enviar WhatsApp a ${client.name}`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>WhatsApp Directo</span>
          </a>
        ) : (
          <div className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-xs text-gray-400">
            <Phone className="h-4 w-4" />
            <span>Sin teléfono</span>
          </div>
        )}

        <Link
          href={`/clients/${client.id}`}
          className="ml-3 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          aria-label="Ver Perfil"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
};

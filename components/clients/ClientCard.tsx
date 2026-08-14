'use client';

import React from 'react';
import Link from 'next/link';
import { MessageSquare, Phone, Building2, UserCheck, ChevronRight, Ban, AlertTriangle, ArchiveRestore } from 'lucide-react';
import { Client } from '@/types';
import { HealthScoreMeter } from './HealthScoreMeter';
import { generateWhatsAppLink, buildClientGreeting } from '@/lib/whatsappLink';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';

interface ClientCardProps {
  client: Client;
  onEdit?: (client: Client) => void;
  /**
   * Restores this client from the archived view (#337).
   *
   * When present, the card is rendered as an archived entry: the profile link
   * is replaced by a restore action. The detail page resolves its client from
   * the active directory, so an archived client has no profile page to reach —
   * the archived view is a holding area you restore *from*, not browse
   * through, and offering a link into a "Cliente no encontrado" would be the
   * dead end this feature exists to remove.
   */
  onRestore?: (client: Client) => void;
}

export const ClientCard: React.FC<ClientCardProps> = ({ client, onRestore }) => {
  const { org } = useCurrentOrg();
  const waMessage = buildClientGreeting(client.contact_name || client.name, org?.name);
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
              {/* Archived clients have no profile page to reach, so the name
                  is text rather than a link that goes nowhere. */}
              {onRestore ? (
                <span className="block truncate text-base font-extrabold text-white">
                  {client.name}
                </span>
              ) : (
                <Link
                  href={`/clients/${client.id}`}
                  className="text-base font-extrabold text-white transition-colors hover:text-emerald-400 focus:outline-none block truncate"
                >
                  {client.name}
                </Link>
              )}
              {client.contact_name && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 truncate">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{client.contact_name}</span>
                </div>
              )}
            </div>
          </div>
          {/* No invented 100 for an unknown score (#108) */}
          <HealthScoreMeter score={client.health_score ?? undefined} compact />
        </div>

        {/* SAT Tax Meta & B2B Credit Badge */}
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
          {/* A blocked or suspended client says so first, whether or not a
              limit is on file — the two columns are independent, and the
              directory must not look calmer than the detail page (#96). */}
          {client.credit_status === 'blocked' || client.credit_status === 'suspended' ? (
            // Text *and* icon. #96 already gave each state its own words; the
            // icon is the second non-colour channel, matching ReceivableCard —
            // this badge decides whether to extend credit, so a colourblind
            // owner must not depend on rose-vs-amber to read it (#101).
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-bold border ${
              client.credit_status === 'blocked'
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
            }`}>
              {client.credit_status === 'blocked' ? (
                <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {client.credit_status === 'blocked' ? 'Crédito bloqueado' : 'Crédito suspendido'}
            </span>
          ) : (client.credit_limit ?? 0) > 0 ? (
            <span className="rounded-lg px-2.5 py-1 font-bold border bg-emerald-950/80 text-emerald-300 border-emerald-500/40">
              Crédito: ${(client.credit_limit || 0).toLocaleString('es-MX')} MXN
              {client.credit_days === null || client.credit_days === undefined
                ? ''
                : ` (${client.credit_days}d)`}
            </span>
          ) : client.credit_limit === null || client.credit_limit === undefined ? (
            // No credit line on file. This used to read "Contado (0 días)",
            // stating payment terms nobody had chosen (#96).
            <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-slate-400 border border-slate-800">
              Sin crédito asignado
            </span>
          ) : (
            <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-slate-400 border border-slate-800">
              Contado (0 días)
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

        {onRestore ? (
          <button
            type="button"
            onClick={() => onRestore(client)}
            className="ml-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/60 px-4 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-900/60 active:scale-95"
          >
            <ArchiveRestore className="h-4 w-4" />
            <span>Restaurar</span>
          </button>
        ) : (
          <Link
            href={`/clients/${client.id}`}
            className="ml-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Ver Perfil"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        )}
      </div>
    </div>
  );
};

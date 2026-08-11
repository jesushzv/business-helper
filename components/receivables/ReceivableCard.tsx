'use client';

import React from 'react';
import { MilestoneWithClient } from '@/lib/hooks/useReceivables';
import { generatePaymentReminderLink } from '@/lib/whatsappReminder';
import { MessageSquare, CheckCircle, ExternalLink, FileCheck, Clock, AlertCircle } from 'lucide-react';

interface ReceivableCardProps {
  milestone: MilestoneWithClient;
  todayStr?: string;
  onOpenConfirmModal?: (milestone: MilestoneWithClient) => void;
  /**
   * False when the organization has no CLABE (#64). Both actions here hand a
   * `/pay/` link to a client, and that page answers 409 without a settlement
   * account — so sharing it sends the customer to a dead end.
   *
   * Defaults to true so an unknown state never blocks the page; the server
   * gate refuses regardless. Only a confirmed-missing account disables.
   */
  canShare?: boolean;
}

export const ReceivableCard: React.FC<ReceivableCardProps> = ({
  milestone,
  todayStr = new Date().toISOString().split('T')[0],
  onOpenConfirmModal,
  canShare = true,
}) => {
  const formattedAmount = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(milestone.amount);

  const dueDate = milestone.due_date ? milestone.due_date.substring(0, 10) : '';
  const isOverdue = (milestone.status === 'pending' || milestone.status === 'requested') && dueDate < todayStr;
  const isDueToday = (milestone.status === 'pending' || milestone.status === 'requested') && dueDate === todayStr;
  const isMarkedPaid = milestone.status === 'marked_paid';
  const isConfirmed = milestone.status === 'confirmed';

  let statusBadge = {
    text: 'Pendiente',
    bg: 'bg-slate-800',
    color: 'text-slate-300 border-slate-700',
    icon: Clock,
  };

  if (isConfirmed) {
    statusBadge = { text: 'Confirmado', bg: 'bg-emerald-950/80', color: 'text-emerald-400 border-emerald-500/30', icon: CheckCircle };
  } else if (isMarkedPaid) {
    statusBadge = { text: 'Comprobante Subido', bg: 'bg-blue-950/80', color: 'text-blue-300 border-blue-500/30', icon: FileCheck };
  } else if (isOverdue) {
    statusBadge = { text: 'Atrasado', bg: 'bg-rose-950/80', color: 'text-rose-400 border-rose-500/30', icon: AlertCircle };
  } else if (isDueToday) {
    statusBadge = { text: 'Vence Hoy', bg: 'bg-amber-950/80', color: 'text-amber-300 border-amber-500/30', icon: Clock };
  }

  const StatusIcon = statusBadge.icon;

  const reminderStatus = isOverdue ? 'overdue' : isDueToday ? 'due_today' : 'upcoming_3d';

  // No payment page exists for a milestone whose contract has no quote behind
  // it. The fallbacks here were `'demo'` and `'demo_token'`, which turned that
  // absence into `/pay/demo` — a link that looks live, sends the client to
  // "Cobro no encontrado", and tells the tenant nothing. Absent is absent.
  const payToken = milestone.public_token || null;
  /**
   * The account this quote named has been archived (#164), so its `/pay/` page
   * refuses — `resolveQuoteAccount` will not substitute another.
   *
   * The organization-level readiness gate cannot see this: a tenant with two
   * accounts who archives the non-default one is still "ready", so without this
   * the reminder goes out, the client opens the link, and it turns them away.
   * The link is built here in the browser as a `wa.me/` URL, so the server
   * refusal on the broadcast route cannot catch this path.
   */
  const payAccountArchived = milestone.pay_account_archived === true;
  const hasPayLink = Boolean(payToken) && !payAccountArchived;

  // No fallback number: a payment reminder carries the amount owed and the
  // /pay/ link, and must never go to a phone the tenant did not record. The
  // previous default was a real, dialable Monterrey number (#44).
  const whatsappUrl = milestone.client_phone && canShare && hasPayLink && payToken
    ? generatePaymentReminderLink({
        phone: milestone.client_phone,
        clientName: milestone.client_name || 'Cliente',
        milestoneLabel: milestone.label,
        amount: milestone.amount,
        dueDate: milestone.due_date,
        status: reminderStatus,
        payToken,
      })
    : null;

  /** The one thing the tenant has to fix, named specifically. */
  const blockedReason = !canShare
    ? 'Agrega la CLABE de tu negocio para poder cobrar'
    : payAccountArchived
      ? 'La cuenta de cobro de esta cotización está archivada. Vuelve a cotizar con otra cuenta.'
      : !hasPayLink
        ? 'Este cobro no tiene una cotización con liga de pago'
        : 'Agrega un teléfono al cliente para enviar recordatorios por WhatsApp';

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl hover:border-slate-700 transition-all p-5 flex flex-col justify-between text-white">
      <div>
        {/* Header Badges */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {milestone.contract_title || 'Contrato sin título'}
            </span>
            <h3 className="text-lg font-bold text-white leading-snug mt-0.5">{milestone.label}</h3>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg} ${statusBadge.color}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {statusBadge.text}
          </span>
        </div>

        {/* Client & Date Details */}
        <div className="text-sm text-slate-300 mb-4 space-y-1">
          <p className="font-semibold text-slate-200">{milestone.client_name || 'Cliente no asignado'}</p>
          <p className="text-xs text-slate-400">
            Fecha de vencimiento: <span className="font-semibold text-slate-200">{milestone.due_date}</span>
          </p>
          {milestone.tracking_reference && (
            <p className="text-xs font-mono text-indigo-300 bg-indigo-950/80 p-1.5 rounded-lg inline-block border border-indigo-500/30">
              Clave SPEI: {milestone.tracking_reference}
            </p>
          )}
        </div>

        {/* Amount Card */}
        <div className="bg-slate-950/80 rounded-xl p-3.5 mb-4 border border-slate-800 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-400">Monto del Hito</span>
          <span
            className={`text-2xl font-black font-mono ${
              isOverdue ? 'text-rose-400' : isConfirmed ? 'text-emerald-400' : 'text-white'
            }`}
          >
            {formattedAmount}
          </span>
        </div>
      </div>

      {/* Touch Action Buttons */}
      <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {!isConfirmed && (
            whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40 text-xs sm:text-sm whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>Recordar WhatsApp</span>
              </a>
            ) : (
              // The reason must name the thing the owner has to fix. A missing
              // CLABE reported as a missing phone number sends them to edit the
              // wrong record.
              <button
                type="button"
                disabled
                title={blockedReason}
                className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 bg-slate-800 text-slate-500 font-bold rounded-xl flex items-center justify-center gap-2 border border-slate-700 cursor-not-allowed text-xs sm:text-sm text-center"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>
                  {!canShare
                    ? 'Agrega tu CLABE para cobrar'
                    : payAccountArchived
                      ? 'Cuenta de cobro archivada'
                      : !hasPayLink
                        ? 'Sin liga de pago'
                        : 'Agrega un teléfono para WhatsApp'}
                </span>
              </button>
            )
          )}

          {canShare && hasPayLink && payToken ? (
            <a
              href={`/pay/${payToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${
                isConfirmed ? 'w-full' : 'shrink-0'
              } min-h-[44px] px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-xs sm:text-sm whitespace-nowrap`}
            >
              <ExternalLink className="w-4 h-4 shrink-0 text-slate-400" />
              <span>Portal SPEI</span>
            </a>
          ) : (
            // Not a link at all: this is the URL the owner copies to send a
            // client, and without a CLABE that page answers 409 — or without a
            // quote token, 404.
            <button
              type="button"
              disabled
              title={
                canShare
                  ? 'Este cobro no tiene una cotización con liga de pago'
                  : 'Agrega la CLABE de tu negocio para poder cobrar'
              }
              className={`${
                isConfirmed ? 'w-full' : 'shrink-0'
              } min-h-[44px] px-3.5 py-2.5 bg-slate-800 text-slate-500 border border-slate-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-not-allowed text-xs sm:text-sm whitespace-nowrap`}
            >
              <ExternalLink className="w-4 h-4 shrink-0 text-slate-500" />
              <span>Portal SPEI</span>
            </button>
          )}
        </div>

        {!isConfirmed && (
          <button
            onClick={() => onOpenConfirmModal && onOpenConfirmModal(milestone)}
            className={`w-full min-h-[44px] px-4 py-2.5 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md text-xs sm:text-sm whitespace-nowrap ${
              isMarkedPaid
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{isMarkedPaid ? 'Revisar Comprobante' : 'Confirmar Pago'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

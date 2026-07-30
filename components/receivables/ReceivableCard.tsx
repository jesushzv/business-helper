'use client';

import React from 'react';
import { MilestoneWithClient } from '@/lib/hooks/useReceivables';
import { generatePaymentReminderLink } from '@/lib/whatsappReminder';
import { MessageSquare, CheckCircle, ExternalLink, FileCheck, Clock, AlertCircle } from 'lucide-react';

interface ReceivableCardProps {
  milestone: MilestoneWithClient;
  todayStr?: string;
  onOpenConfirmModal?: (milestone: MilestoneWithClient) => void;
}

export const ReceivableCard: React.FC<ReceivableCardProps> = ({
  milestone,
  todayStr = new Date().toISOString().split('T')[0],
  onOpenConfirmModal,
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
    bg: 'bg-slate-100',
    color: 'text-slate-700',
    icon: Clock,
  };

  if (isConfirmed) {
    statusBadge = { text: 'Confirmado', bg: 'bg-emerald-100', color: 'text-emerald-800', icon: CheckCircle };
  } else if (isMarkedPaid) {
    statusBadge = { text: 'Comprobante Subido', bg: 'bg-blue-100', color: 'text-blue-800', icon: FileCheck };
  } else if (isOverdue) {
    statusBadge = { text: 'Atrasado', bg: 'bg-red-100', color: 'text-red-800', icon: AlertCircle };
  } else if (isDueToday) {
    statusBadge = { text: 'Vence Hoy', bg: 'bg-amber-100', color: 'text-amber-800', icon: Clock };
  }

  const StatusIcon = statusBadge.icon;

  const reminderStatus = isOverdue ? 'overdue' : isDueToday ? 'due_today' : 'upcoming_3d';
  const whatsappUrl = generatePaymentReminderLink({
    phone: milestone.client_phone || '8115551234',
    clientName: milestone.client_name || 'Cliente',
    milestoneLabel: milestone.label,
    amount: milestone.amount,
    dueDate: milestone.due_date,
    status: reminderStatus,
    payToken: milestone.public_token || 'demo_token',
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
      <div>
        {/* Header Badges */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {milestone.contract_title || 'Contrato sin título'}
            </span>
            <h3 className="text-lg font-bold text-slate-900 leading-snug mt-0.5">{milestone.label}</h3>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusBadge.bg} ${statusBadge.color}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {statusBadge.text}
          </span>
        </div>

        {/* Client & Date Details */}
        <div className="text-sm text-slate-600 mb-4 space-y-1">
          <p className="font-medium text-slate-800">{milestone.client_name || 'Cliente no asignado'}</p>
          <p className="text-xs text-slate-500">
            Fecha de vencimiento: <span className="font-semibold text-slate-700">{milestone.due_date}</span>
          </p>
          {milestone.tracking_reference && (
            <p className="text-xs font-mono text-indigo-600 bg-indigo-50 p-1.5 rounded-lg inline-block">
              Clave SPEI: {milestone.tracking_reference}
            </p>
          )}
        </div>

        {/* Amount Card */}
        <div className="bg-slate-50 rounded-xl p-3.5 mb-4 border border-slate-100 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-500">Monto del Hito</span>
          <span
            className={`text-2xl font-black ${
              isOverdue ? 'text-red-600' : isConfirmed ? 'text-emerald-600' : 'text-slate-900'
            }`}
          >
            {formattedAmount}
          </span>
        </div>
      </div>

      {/* Touch Action Buttons (>= 48px min-height) */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
        {!isConfirmed && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
          >
            <MessageSquare className="w-5 h-5" />
            <span>Recordar WhatsApp</span>
          </a>
        )}

        {!isConfirmed && (
          <button
            onClick={() => onOpenConfirmModal && onOpenConfirmModal(milestone)}
            className={`min-h-[48px] px-4 py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm ${
              isMarkedPaid
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <CheckCircle className="w-5 h-5" />
            <span>{isMarkedPaid ? 'Revisar Comprobante' : 'Confirmar Pago'}</span>
          </button>
        )}

        <a
          href={`/pay/${milestone.public_token || 'demo'}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Portal SPEI</span>
        </a>
      </div>
    </div>
  );
};

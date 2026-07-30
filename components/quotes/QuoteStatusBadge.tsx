'use client';

import React from 'react';

interface QuoteStatusBadgeProps {
  status: string;
}

export const QuoteStatusBadge: React.FC<QuoteStatusBadgeProps> = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'sent':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'accepted':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'expired':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'converted':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'sent':
        return 'Enviada';
      case 'accepted':
        return 'Aceptada';
      case 'rejected':
        return 'Rechazada';
      case 'expired':
        return 'Vencida';
      case 'converted':
        return 'Convertida a Contrato';
      default:
        return status;
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeStyle()}`}>
      {getLabel()}
    </span>
  );
};

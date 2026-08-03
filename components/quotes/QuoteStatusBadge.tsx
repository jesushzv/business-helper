'use client';

import React from 'react';

interface QuoteStatusBadgeProps {
  status: string;
}

export const QuoteStatusBadge: React.FC<QuoteStatusBadgeProps> = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'draft':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'sent':
        return 'bg-blue-950/80 text-blue-300 border-blue-500/30';
      case 'accepted':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30';
      case 'rejected':
        return 'bg-rose-950/80 text-rose-400 border-rose-500/30';
      case 'expired':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/30';
      case 'converted':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
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

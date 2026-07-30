'use client';

import React from 'react';
import { Quote, Client } from '@/types';
import { QuoteStatusBadge } from './QuoteStatusBadge';
import { generateWhatsAppLink } from '@/lib/whatsappLink';
import { MessageSquare, ArrowRight, CheckCircle, FileText } from 'lucide-react';

interface QuoteCardProps {
  quote: Quote;
  client?: Client;
  onConvert?: (quoteId: string) => void;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, client, onConvert }) => {
  const formattedTotal = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: quote.currency || 'MXN',
  }).format(quote.total_amount);

  const clientName = client?.name || 'Cliente sin asignar';
  const clientPhone = client?.phone || '8115551234';

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/q/${quote.public_token}`
    : `https://businesshelper.mx/q/${quote.public_token}`;

  const messageText = `Hola ${clientName}, le comparto la cotización "${quote.title}" por un total de ${formattedTotal}.\n\nPuede ver el detalle y firmar en línea aquí:\n${publicUrl}`;
  const whatsappUrl = generateWhatsAppLink(clientPhone, messageText);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Cotización #{quote.id.substring(0, 8)}
            </span>
            <h3 className="text-lg font-bold text-slate-900 leading-snug mt-0.5">{quote.title}</h3>
          </div>
          <QuoteStatusBadge status={quote.status} />
        </div>

        <div className="text-sm text-slate-600 mb-4 space-y-1">
          <p className="font-medium text-slate-800">{clientName}</p>
          {quote.valid_until && (
            <p className="text-xs text-slate-400">Válida hasta: {quote.valid_until}</p>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 mb-4 border border-slate-100 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-500">Monto Total</span>
          <span className="text-2xl font-black text-slate-900">{formattedTotal}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
        {/* 1-Tap WhatsApp Button (>= 48px touch target) */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
        >
          <MessageSquare className="w-5 h-5" />
          <span>Enviar por WhatsApp</span>
        </a>

        {/* Convert to Contract Action Button if Accepted */}
        {quote.status === 'accepted' && (
          <button
            onClick={() => onConvert && onConvert(quote.id)}
            className="min-h-[48px] px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Convertir a Contrato</span>
          </button>
        )}

        {/* View Details Link */}
        <a
          href={`/q/${quote.public_token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-sm"
        >
          <FileText className="w-4 h-4" />
          <span>Ver Portal</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};

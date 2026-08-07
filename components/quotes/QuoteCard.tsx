'use client';

import React from 'react';
import { Quote, Client } from '@/types';
import { QuoteStatusBadge } from './QuoteStatusBadge';
import { generateWhatsAppLink } from '@/lib/whatsappLink';
import { trackClientEvent } from '@/lib/analyticsClient';
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

  /**
   * Sending is a `wa.me` hand-off, so the click is the only moment the product
   * sees it — and it is the step that separates "made a quote to try the
   * product" from "trusted it enough to put it in front of a paying client."
   * Quotes are stored as `sent` from creation, so the stored status cannot
   * answer that question.
   */
  const handleWhatsAppSend = () => {
    trackClientEvent('quote_sent', {
      quote_id: quote.id,
      total_amount: quote.total_amount,
      currency: quote.currency || 'MXN',
      // A missing number means the link opens on a placeholder recipient
      // (issue #44) — worth being able to see in the funnel.
      client_has_phone: Boolean(client?.phone),
    });
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl hover:border-slate-700 transition-all p-5 flex flex-col justify-between text-white">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Cotización #{quote.id.substring(0, 8)}
            </span>
            <h3 className="text-lg font-bold text-white leading-snug mt-0.5">{quote.title}</h3>
          </div>
          <QuoteStatusBadge status={quote.status} />
        </div>

        <div className="text-sm text-slate-300 mb-4 space-y-1">
          <p className="font-semibold text-slate-200">{clientName}</p>
          {quote.valid_until && (
            <p className="text-xs text-slate-400">Válida hasta: {quote.valid_until}</p>
          )}
        </div>

        <div className="bg-slate-950/80 rounded-xl p-3.5 mb-4 border border-slate-800 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-400">Monto Total</span>
          <span className="text-2xl font-black font-mono text-white">{formattedTotal}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {/* 1-Tap WhatsApp Button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsAppSend}
            className="flex-1 min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40 text-xs sm:text-sm whitespace-nowrap"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Enviar por WhatsApp</span>
          </a>

          {/* View Details Link */}
          <a
            href={`/q/${quote.public_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-xs sm:text-sm whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Ver Portal</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          </a>
        </div>

        {/* Convert to Contract Action Button if Accepted */}
        {quote.status === 'accepted' && (
          <button
            onClick={() => onConvert && onConvert(quote.id)}
            className="w-full min-h-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-xs sm:text-sm whitespace-nowrap"
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Convertir a Contrato</span>
          </button>
        )}
      </div>
    </div>
  );
};

'use client';

import React, { useState } from 'react';
import { Quote, Client } from '@/types';
import { QuoteStatusBadge } from './QuoteStatusBadge';
import { generateWhatsAppLink } from '@/lib/whatsappLink';
import { track } from '@/lib/analytics';
import { getQuotePublicUrl } from '@/lib/url';
import { MessageSquare, ArrowRight, CheckCircle, FileText } from 'lucide-react';

interface QuoteCardProps {
  quote: Quote;
  client?: Client;
  /**
   * Returns a promise so the button can stay disabled until the conversion
   * actually finishes. Typed `=> void`, the card could not await the parent's
   * async handler and never disabled, so two taps on a slow connection sent
   * two POSTs to `/api/quotes/[id]/convert` — duplicate contracts, duplicate
   * collection milestones (#99). The route also 409s on an already-converted
   * quote, which is the enforcement that matters; this is the other half.
   */
  onConvert?: (quoteId: string) => void | Promise<void>;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, client, onConvert }) => {
  const [converting, setConverting] = useState(false);

  const handleConvert = async () => {
    if (!onConvert || converting) return;
    setConverting(true);
    try {
      await onConvert(quote.id);
    } finally {
      setConverting(false);
    }
  };

  const formattedTotal = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: quote.currency || 'MXN',
  }).format(quote.total_amount);

  const clientName = client?.name || 'Cliente sin asignar';
  // No fallback number: a quote must never be sent to a phone the tenant did
  // not record. The previous default was a real, dialable Monterrey number.
  const clientPhone = client?.phone || null;

  const publicUrl = getQuotePublicUrl(quote.public_token);

  const messageText = `Hola ${clientName}, le comparto la cotización "${quote.title}" por un total de ${formattedTotal}.\n\nPuede ver el detalle y firmar en línea aquí:\n${publicUrl}`;
  const whatsappUrl = clientPhone ? generateWhatsAppLink(clientPhone, messageText) : null;

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
          {/* 1-Tap WhatsApp Button — only when the client has a phone on record */}
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('quote_sent', { organization_id: quote.organization_id, quote_id: quote.id })}
              className="flex-1 min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/40 text-xs sm:text-sm whitespace-nowrap"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Enviar por WhatsApp</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Agrega un teléfono al cliente para enviar por WhatsApp"
              className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 bg-slate-800 text-slate-500 font-bold rounded-xl flex items-center justify-center gap-2 border border-slate-700 cursor-not-allowed text-xs sm:text-sm text-center"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Agrega un teléfono para WhatsApp</span>
            </button>
          )}

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
            onClick={handleConvert}
            disabled={converting}
            className="w-full min-h-[44px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-xs sm:text-sm whitespace-nowrap disabled:opacity-60"
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{converting ? 'Convirtiendo…' : 'Convertir a Contrato'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

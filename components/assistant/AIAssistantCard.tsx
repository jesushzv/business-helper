'use client';

import React from 'react';
import { useAIAssistant } from '@/lib/hooks/useAIAssistant';
import { Bot, Send, Sparkles, MessageSquare, ArrowRight, DollarSign, Info, AlertCircle } from 'lucide-react';

const SUGGESTED_QUERIES = [
  '¿Qué cliente me debe más?',
  '¿Cuáles pagos vencen hoy?',
  '¿Qué clientes tienen facturas pendientes?',
  '¿Cuánto hemos cobrado este mes?'
];

export function AIAssistantCard() {
  const { query, setQuery, history, loading, error, isDemoMode, askAssistant } = useAIAssistant();

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    askAssistant(query);
  };

  const handleChipClick = (q: string) => {
    askAssistant(q);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg border border-indigo-700/50">
        <div className="flex items-center gap-3 mb-3">
          <span className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-500/30">
            <Bot className="w-6 h-6" />
          </span>
          <span className="text-xs font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-3 py-1 rounded-full border border-indigo-400/30 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            WhatsApp AI Operations Assistant
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Asistente Virtual de Operaciones
        </h2>
        <p className="text-indigo-200 text-sm sm:text-base max-w-xl mt-1">
          Haz preguntas en lenguaje natural sobre tus saldos, adeudos de clientes y cobros pendientes, y obtén enlaces de acción de 1 clic para WhatsApp.
        </p>
      </div>

      {/* What this assistant actually is. The card presented keyword matching
          over a fixed sample ledger as an AI reading the user's business; both
          halves of that are now stated. */}
      <div className="flex items-start gap-2 p-4 rounded-2xl border border-slate-800 bg-slate-900/90 text-sm text-slate-300">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <span>
          {isDemoMode
            ? 'Estás viendo la demostración: las respuestas usan un negocio de ejemplo, no datos reales.'
            : 'Las respuestas se calculan con reglas sobre tus clientes y cobros registrados.'}
        </span>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-4 rounded-2xl border border-rose-500/30 bg-rose-950/80 text-sm text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Suggested Quick Queries */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {SUGGESTED_QUERIES.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleChipClick(q)}
            className="min-h-[48px] px-4 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white font-medium rounded-xl border border-slate-800 transition-all shrink-0 text-sm flex items-center gap-1.5 shadow-xl"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            {q}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="relative">
        <input
          type="text"
          placeholder="Escribe tu pregunta (ej. ¿Cuánto me debe Grupo Salinas?)..."
            aria-label="Escribe tu pregunta al asistente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-h-[56px] pl-5 pr-14 bg-slate-900/90 border border-slate-800 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all text-base shadow-xl"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          aria-label="Enviar pregunta"
          className="absolute right-2 top-2 min-h-[48px] min-w-[48px] px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center shadow-md disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Response Feed */}
      <div className="space-y-4">
        {history.map((item, index) => (
          <div
            key={index}
            className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-3 text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-white text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                &ldquo;{item.query}&rdquo;
              </span>
              <span className="text-xs text-slate-400 font-medium flex items-center gap-2">
                {item.isDemo && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                    Ejemplo
                  </span>
                )}
                {item.timestamp}
              </span>
            </div>

            <p className="text-slate-200 text-base leading-relaxed">{item.answerText}</p>

            <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
              {item.matchedClient && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-950/80 text-amber-300 px-3 py-1 rounded-lg border border-amber-500/30">
                  <DollarSign className="w-3.5 h-3.5" />
                  Cliente Identificado: {item.matchedClient}
                </span>
              )}

              <a
                href={item.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-md ml-auto"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar Recordatorio por WhatsApp
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

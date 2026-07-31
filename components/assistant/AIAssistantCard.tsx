'use client';

import React from 'react';
import { useAIAssistant } from '@/lib/hooks/useAIAssistant';
import { Bot, Send, Sparkles, MessageSquare, ArrowRight, DollarSign } from 'lucide-react';

const SUGGESTED_QUERIES = [
  '¿Cuánto me debe Grupo Salinas?',
  '¿Cuáles pagos vencen hoy?',
  '¿Qué clientes tienen facturas pendientes?',
  '¿Cuánto hemos cobrado este mes?'
];

export function AIAssistantCard() {
  const { query, setQuery, history, loading, askAssistant } = useAIAssistant();

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

      {/* Suggested Quick Queries */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {SUGGESTED_QUERIES.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleChipClick(q)}
            className="min-h-[48px] px-4 bg-white hover:bg-indigo-50/80 text-slate-700 hover:text-indigo-700 font-medium rounded-xl border border-slate-200 hover:border-indigo-200 transition-all shrink-0 text-sm flex items-center gap-1.5 shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            {q}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="relative">
        <input
          type="text"
          placeholder="Escribe tu pregunta (ej. ¿Cuánto me debe Grupo Salinas?)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-h-[56px] pl-5 pr-14 bg-white border border-slate-200 rounded-2xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-base shadow-sm"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-2 min-h-[40px] min-w-[40px] px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium rounded-xl transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Response Feed */}
      <div className="space-y-4">
        {history.map((item, index) => (
          <div
            key={index}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="font-bold text-slate-900 text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                &ldquo;{item.query}&rdquo;
              </span>
              <span className="text-xs text-slate-400 font-medium">{item.timestamp}</span>
            </div>

            <p className="text-slate-800 text-base leading-relaxed">{item.answerText}</p>

            <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
              {item.matchedClient && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-50 text-amber-800 px-3 py-1 rounded-lg border border-amber-200">
                  <DollarSign className="w-3.5 h-3.5" />
                  Cliente Identificado: {item.matchedClient}
                </span>
              )}

              <a
                href={item.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-sm ml-auto"
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

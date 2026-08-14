'use client';

import React, { useState } from 'react';
import {
  Search,
  HelpCircle,
  FileText,
  DollarSign,
  FileCode,
  Settings,
  ChevronDown,
  X,
  Sparkles,
  Send,
  Loader2,
  Bot,
  User,
} from 'lucide-react';
import { CATEGORIES, searchFAQItems } from '@/lib/helpFAQ';

const ICON_MAP: Record<string, React.ElementType> = {
  HelpCircle,
  FileText,
  DollarSign,
  FileCode,
  Settings,
};

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  category?: string;
}

export const HelpCenterView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [expandedId, setExpandedId] = useState<string | null>('cot-1');

  // In-App AI Support Chat State
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: '¡Hola! Soy tu Agente de IA de Soporte Técnico para Business Helper. Pregúntame sobre cómo crear cotizaciones, subir pagos SPEI, facturación SAT CFDI 4.0, roles de equipo o personalización de marca.',
    },
  ]);

  const filteredItems = searchFAQItems(searchQuery, selectedCategory);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleAskAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = aiQuestion.trim();
    if (!query || isAiLoading) return;

    // Append user message
    const userMsgId = `u-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: userMsgId, sender: 'user', text: query }]);
    setAiQuestion('');
    setIsAiLoading(true);

    try {
      const res = await fetch('/api/ai/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (data?.response?.answerText) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: 'bot',
            text: data.response.answerText,
            category: data.response.matchedFAQ?.category,
          },
        ]);
      } else {
        // The route's own message when it sent one (#295): a rate-limited user
        // told "intenta reformular tu pregunta" rephrases and retries straight
        // into the same 429, when the actual instruction is to wait. The
        // envelope's Spanish is written to be rendered verbatim; the generic
        // copy covers only shapeless failures.
        const routeMessage =
          typeof data?.error?.message === 'string' && data.error.message.trim()
            ? data.error.message
            : null;
        setChatMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: 'bot',
            text:
              routeMessage ||
              'Disculpa, no pude procesar tu duda en este momento. Por favor selecciona un tema en el buscador o intenta reformular tu pregunta.',
          },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'bot',
          text: 'Ocurrió un error al conectar con el Agente de IA. Revisa tu conexión a internet e intenta nuevamente.',
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-100 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Centro de Ayuda & Agente de IA de Soporte</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              ¿En qué podemos ayudarte hoy?
            </h1>
            <p className="mt-1 text-sm text-indigo-100">
              Obtén respuestas al instante de nuestro Agente de IA de Soporte o explora las preguntas frecuentes.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mt-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar duda en la base de conocimientos (ej: SPEI, SAT, Cotización)..."
            aria-label="Buscar en la ayuda"
            className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 py-3.5 pl-11 pr-10 text-sm font-medium text-white shadow-lg placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 min-h-[48px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white min-h-[48px] min-w-[48px] justify-center"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* In-App Interactive AI Support Agent Chat */}
      <div className="overflow-hidden rounded-3xl border border-indigo-500/30 bg-slate-900/90 p-6 shadow-xl text-white">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-slate-950 font-bold shadow-md">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Agente de IA para Soporte Técnico
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/40">
                24/7 En Vivo
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Resuelve tus dudas al instante sobre cómo funciona el producto y sus herramientas.
            </p>
          </div>
        </div>

        {/* Chat Feed */}
        <div className="mt-4 max-h-72 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'bot' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white mt-1">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-500 text-slate-950 font-semibold rounded-tr-none'
                    : 'bg-slate-950 text-slate-200 border border-slate-800 rounded-tl-none'
                }`}
              >
                {msg.category && (
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                    Tema: {msg.category}
                  </span>
                )}
                <p className="whitespace-pre-line">{msg.text}</p>
              </div>
              {msg.sender === 'user' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {isAiLoading && (
            <div className="flex items-center gap-3 text-xs text-slate-400 italic bg-slate-950/80 p-3 rounded-2xl border border-slate-800 w-fit">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>El Agente de IA está analizando tu pregunta...</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleAskAI} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            placeholder="Escribe tu pregunta para la IA (ej: ¿Cómo descargo el paquete para mi contador?)"
            className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[48px]"
          />
          <button
            type="submit"
            disabled={!aiQuestion.trim() || isAiLoading}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-sm font-extrabold text-slate-950 transition-all min-h-[48px] shrink-0 shadow-md"
          >
            {isAiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>Preguntar</span>
                <Send className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const Icon = ICON_MAP[cat.iconName] || HelpCircle;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-bold transition-all min-h-[48px] ${
                isSelected
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/50'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Icon className={`h-4 w-4 ${isSelected ? 'text-slate-950' : 'text-emerald-400'}`} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* FAQ List / Accordion */}
      <div className="space-y-3">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 transition-all shadow-xl hover:border-slate-700"
              >
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 sm:p-5 text-left min-h-[56px] focus:outline-hidden"
                >
                  <span className="text-base font-bold text-white">
                    {item.question}
                  </span>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-180 bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' : ''
                    }`}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/80 p-4 sm:p-5 text-sm text-slate-300 leading-relaxed animate-in fade-in duration-150">
                    <p>{item.answer}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 border border-slate-700 font-mono"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/90 p-8 text-center text-white">
            <HelpCircle className="mx-auto h-12 w-12 text-slate-600" />
            <h3 className="mt-3 text-base font-bold text-white">
              No encontramos respuestas para &quot;{searchQuery}&quot;
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Utiliza el Agente de IA para Soporte arriba para escribir tu consulta personalizada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

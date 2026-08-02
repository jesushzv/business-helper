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
  MessageSquare,
  X,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { FAQ_ITEMS, CATEGORIES, searchFAQItems, generateWhatsAppSupportLink } from '@/lib/helpFAQ';

const ICON_MAP: Record<string, React.ElementType> = {
  HelpCircle,
  FileText,
  DollarSign,
  FileCode,
  Settings,
};

export const HelpCenterView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [expandedId, setExpandedId] = useState<string | null>('cot-1');

  const filteredItems = searchFAQItems(searchQuery, selectedCategory);
  const whatsappSupportUrl = generateWhatsAppSupportLink(searchQuery);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/30 px-3 py-1 text-xs font-semibold text-indigo-100 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>Centro de Ayuda & Preguntas Frecuentes</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              ¿En qué podemos ayudarte hoy?
            </h1>
            <p className="mt-1 text-sm text-indigo-100">
              Respuestas rápidas sobre Cotizaciones, Cobranza SPEI y Facturación SAT CFDI 4.0
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mt-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar duda (ej: SPEI, SAT, Cotización)..."
            className="w-full rounded-2xl border-0 bg-white py-3.5 pl-11 pr-10 text-sm font-medium text-gray-900 shadow-lg placeholder:text-gray-400 focus:ring-2 focus:ring-amber-400 min-h-[48px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 min-h-[48px] min-w-[48px] justify-center"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
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
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-indigo-600'}`} />
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
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all shadow-2xs hover:border-indigo-200"
              >
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 sm:p-5 text-left min-h-[56px] focus:outline-hidden"
                >
                  <span className="text-base font-bold text-gray-900">
                    {item.question}
                  </span>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-transform ${
                      isExpanded ? 'rotate-180 bg-indigo-50 text-indigo-600' : ''
                    }`}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-slate-50/50 p-4 sm:p-5 text-sm text-gray-700 leading-relaxed animate-in fade-in duration-150">
                    <p>{item.answer}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-lg bg-gray-200/60 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
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
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <HelpCircle className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-3 text-base font-bold text-gray-900">
              No encontramos respuestas para "{searchQuery}"
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Prueba buscar con otros términos o escríbenos directamente por WhatsApp.
            </p>
          </div>
        )}
      </div>

      {/* WhatsApp 1-Tap Support CTA (Don Roberto Constraint) */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                ¿Aún tienes dudas o necesitas asistencia?
              </h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Nuestro equipo de soporte para negocios te atiende directamente por WhatsApp.
              </p>
            </div>
          </div>

          <a
            href={whatsappSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-98 min-h-[48px] shrink-0"
          >
            <span>Soporte por WhatsApp</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
};

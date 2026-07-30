'use client';

import React, { useState } from 'react';
import { useQuotes } from '@/lib/hooks/useQuotes';
import { useClients } from '@/lib/hooks/useClients';
import { QuoteCard } from '@/components/quotes/QuoteCard';
import { QuoteWizardModal } from '@/components/quotes/QuoteWizardModal';
import { Plus, Search, FileText, CheckCircle2, Clock, Send } from 'lucide-react';

export default function QuotesPage() {
  const {
    quotes,
    filteredQuotes,
    loading,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    createQuote,
    convertToContract,
  } = useQuotes();

  const { clients } = useClients();
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);

  const totalSent = quotes.filter((q) => q.status === 'sent').length;
  const totalAccepted = quotes.filter((q) => q.status === 'accepted' || q.status === 'converted').length;
  const totalAmountSum = quotes.reduce((acc, q) => acc + q.total_amount, 0);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Cotizaciones y Propuestas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Genera cotizaciones profesionales con cálculo de impuestos SAT y envíalas por WhatsApp en 1 tap.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md transition-colors text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Cotización</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Enviadas</p>
            <p className="text-2xl font-black text-slate-900">{totalSent}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Aceptadas</p>
            <p className="text-2xl font-black text-slate-900">{totalAccepted}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Monto Total en Propuestas</p>
            <p className="text-2xl font-black text-slate-900">
              ${totalAmountSum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cotizaciones por título o notas..."
            className="w-full min-h-[48px] pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'sent', label: 'Enviadas' },
            { id: 'accepted', label: 'Aceptadas' },
            { id: 'converted', label: 'Convertidas' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-medium">Cargando cotizaciones...</div>
      ) : filteredQuotes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <Clock className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">No se encontraron cotizaciones</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Comienza creando tu primera propuesta comercial en 3 pasos con cálculo de impuestos SAT.
          </p>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="inline-flex min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl items-center gap-2 text-sm mt-2"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva Cotización</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuotes.map((q) => {
            const client = clients.find((c) => c.id === q.client_id);
            return (
              <QuoteCard
                key={q.id}
                quote={q}
                client={client}
                onConvert={async (id) => {
                  await convertToContract(id);
                  alert('¡Cotización convertida a contrato con 2 hitos de cobranza!');
                }}
              />
            );
          })}
        </div>
      )}

      {/* Wizard Modal */}
      <QuoteWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        clients={clients}
        onSubmit={async (data) => {
          await createQuote(data);
        }}
      />
    </div>
  );
}

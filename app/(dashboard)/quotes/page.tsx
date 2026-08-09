'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
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
    error,
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
    <>
      <Header
        title="Cotizaciones y Propuestas"
        actionButton={
          <button
            onClick={() => setIsWizardOpen(true)}
            className="flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-emerald-950/50 transition-all hover:bg-emerald-400 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nueva Cotización</span>
          </button>
        }
      />
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Cotizaciones y Propuestas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Genera cotizaciones profesionales con cálculo de impuestos SAT y envíalas por WhatsApp en 1 tap.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="min-h-[48px] px-5 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-950/50 transition-all text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Nueva Cotización</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4 text-white">
          <div className="w-12 h-12 rounded-xl bg-blue-950/80 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0 font-bold">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Enviadas</p>
            <p className="text-2xl font-black font-mono text-white">{totalSent}</p>
          </div>
        </div>

        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4 text-white">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Aceptadas</p>
            <p className="text-2xl font-black font-mono text-white">{totalAccepted}</p>
          </div>
        </div>

        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4 text-white">
          <div className="w-12 h-12 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 font-bold">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Monto Total en Propuestas</p>
            <p className="text-2xl font-black font-mono text-white">
              ${totalAmountSum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cotizaciones por título o notas..."
            className="w-full min-h-[48px] pl-11 pr-4 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
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
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/50'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes Grid. Three states, not two (#97): a failed fetch must not
          greet a tenant who has quotes with the create-your-first-quote CTA. */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-medium">Cargando cotizaciones...</div>
      ) : error ? (
        <div className="bg-rose-950/60 rounded-3xl border border-rose-500/30 p-12 text-center space-y-3">
          <Clock className="w-12 h-12 text-rose-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">No pudimos cargar tus cotizaciones</h3>
          <p className="text-sm text-rose-200 max-w-sm mx-auto">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[48px] px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-white transition-all active:scale-95"
          >
            Reintentar
          </button>
        </div>
      ) : filteredQuotes.length === 0 ? (
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-12 text-center space-y-3 text-white">
          <Clock className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No se encontraron cotizaciones</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Comienza creando tu primera propuesta comercial en 3 pasos con cálculo de impuestos SAT.
          </p>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="inline-flex min-h-[48px] px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl items-center gap-2 text-sm mt-2 shadow-md"
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
                  // Announce what the server actually created, and only after
                  // it confirms. The count was hardcoded at 2 and the message
                  // fired even when the conversion failed (#59).
                  try {
                    const { milestones } = await convertToContract(id);
                    const count = milestones.length;
                    alert(
                      `¡Cotización convertida a contrato con ${count} ${
                        count === 1 ? 'hito' : 'hitos'
                      } de cobranza!`
                    );
                  } catch (err) {
                    alert(
                      err instanceof Error
                        ? err.message
                        : 'No se pudo convertir la cotización a contrato.'
                    );
                  }
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
          setIsWizardOpen(false);
        }}
      />
    </div>
    </>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useReceivables, MilestoneWithClient } from '@/lib/hooks/useReceivables';
import { ReceivablesSummaryCards } from '@/components/receivables/ReceivablesSummaryCards';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import { SpeiConfirmModal } from '@/components/receivables/SpeiConfirmModal';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';
import { useSettlementAccount } from '@/lib/hooks/useSettlementAccount';
import { Search, Wallet, FileText } from 'lucide-react';

export default function ReceivablesPage() {
  const result = useActionResult();
  const {
    filteredReceivables,
    summary,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    confirmPayment,
  } = useReceivables();

  const { ready: settlementReady } = useSettlementAccount();

  // "Nothing matches your filter" and "you have nothing yet" are different
  // facts, and only the second one warrants a route onward (#104).
  const isFiltering = searchQuery.trim() !== '' || statusFilter !== 'all';

  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneWithClient | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleOpenConfirmModal = (milestone: MilestoneWithClient) => {
    setSelectedMilestone(milestone);
    setIsConfirmModalOpen(true);
  };

  return (
    <>
      <Header title="Cuentas por Cobrar (SPEI)" />
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span>Quién me Debe (Cuentas por Cobrar)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitorea cobros pendientes, envía recordatorios por WhatsApp con un toque y valida comprobantes SPEI.
          </p>
        </div>
      </div>

      {/* KPI Cards ("Quién me Debe") */}
      <ReceivablesSummaryCards summary={summary} />

      {/* Search & Status Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, concepto o clave SPEI..."
            aria-label="Buscar cobros"
            className="w-full min-h-[48px] pl-11 pr-4 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'overdue', label: 'Atrasados' },
            { id: 'due_today', label: 'Vence Hoy' },
            { id: 'upcoming', label: 'Por Vencer' },
            { id: 'marked_paid', label: 'Comprobantes' },
            { id: 'confirmed', label: 'Confirmadas' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
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

      {/* Receivables List Grid. Three states, not two (#97): a failed fetch
          must never render "todas tus cuentas están al día" — a factual claim
          about money the app cannot back while holding an error. */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-800/80" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="bg-rose-950/60 rounded-3xl border border-rose-500/30 p-12 text-center space-y-3">
          <Wallet className="w-12 h-12 text-rose-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">No pudimos cargar tu cobranza</h3>
          <p className="text-sm text-rose-200 max-w-sm mx-auto">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[48px] px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-sm font-bold text-white transition-all active:scale-95"
          >
            Reintentar
          </button>
        </div>
      ) : filteredReceivables.length === 0 ? (
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-12 text-center space-y-3 text-white">
          <Wallet className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">
            {isFiltering ? 'Ningún cobro coincide' : 'Todavía no tienes cobros registrados'}
          </h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            {isFiltering
              ? 'Prueba con otra búsqueda o quita el filtro para ver todos.'
              : 'Los cobros nacen de una cotización aceptada: conviértela en contrato y aquí aparecerán sus pagos programados.'}
          </p>
          {/* This screen had no route onward at all — a dead end for a new
              tenant who does not yet know where cobros come from (#104). */}
          {!isFiltering && (
            <Link
              href="/quotes"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-md hover:bg-emerald-400 active:scale-95"
            >
              <FileText className="h-5 w-5" />
              <span>Ir a Cotizaciones</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredReceivables.map((m) => (
            <ReceivableCard
              key={m.id}
              milestone={m}
              onOpenConfirmModal={handleOpenConfirmModal}
              // Only a confirmed-missing settlement account disables sharing;
              // `null` (loading or a failed read) leaves the actions alone and
              // lets the server gate refuse (#64).
              canShare={settlementReady !== false}
            />
          ))}
        </div>
      )}

      {/* Payment Confirmation Modal */}
      <SpeiConfirmModal
        isOpen={isConfirmModalOpen}
        milestone={selectedMilestone}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setSelectedMilestone(null);
        }}
        onConfirm={async (milestoneId, transferredAmount) => {
          const outcome = await confirmPayment(milestoneId, transferredAmount);
          // Announce only the clean case, from the server's own outcome. A
          // failure stays in the modal, which holds itself open; so does a
          // confirmed payment whose SAT complement did not stamp — that
          // warning is a live fiscal obligation, and a green dialog on top of
          // it would bury exactly the thing the tenant must act on.
          if (outcome.success && !outcome.complementError) {
            result.succeed({
              title: 'Pago confirmado',
              message: outcome.milestone
                ? `El cobro «${outcome.milestone.label}» quedó registrado como pagado.`
                : 'El pago quedó registrado.',
            });
          }
          return outcome;
        }}
      />

      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
    </>
  );
}

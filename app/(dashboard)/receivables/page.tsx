'use client';

import React, { useState } from 'react';
import { useReceivables, MilestoneWithClient } from '@/lib/hooks/useReceivables';
import { ReceivablesSummaryCards } from '@/components/receivables/ReceivablesSummaryCards';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import { SpeiConfirmModal } from '@/components/receivables/SpeiConfirmModal';
import { Search, Wallet } from 'lucide-react';

export default function ReceivablesPage() {
  const {
    filteredReceivables,
    summary,
    loading,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    confirmPayment,
  } = useReceivables();

  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneWithClient | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleOpenConfirmModal = (milestone: MilestoneWithClient) => {
    setSelectedMilestone(milestone);
    setIsConfirmModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span>Quién me Debe (Cuentas por Cobrar)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitorea cobros pendientes, envía recordatorios por WhatsApp en 1 tap y valida comprobantes SPEI.
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

      {/* Receivables List Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-medium">Cargando cuentas por cobrar...</div>
      ) : filteredReceivables.length === 0 ? (
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-12 text-center space-y-3 text-white">
          <Wallet className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">No hay cobros en este filtro</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Todas tus cuentas por cobrar están al día o no hay registros que coincidan con la búsqueda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredReceivables.map((m) => (
            <ReceivableCard
              key={m.id}
              milestone={m}
              onOpenConfirmModal={handleOpenConfirmModal}
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
          await confirmPayment(milestoneId, transferredAmount);
        }}
      />
    </div>
  );
}

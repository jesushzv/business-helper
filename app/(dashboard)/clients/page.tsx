'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { ClientCard } from '@/components/clients/ClientCard';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { useClients } from '@/lib/hooks/useClients';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';
import { Search, Users, Plus, ShieldCheck } from 'lucide-react';
import { Client } from '@/types';

export default function ClientsPage() {
  const { filteredClients, searchQuery, setSearchQuery, addClient, loading, error } = useClients();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const result = useActionResult();

  /**
   * The modal closing was the only signal a save had worked, which on a phone
   * is indistinguishable from the tap not registering (#146). Both outcomes now
   * say so out loud.
   *
   * The success text is built from `saved` — the row the server returned — not
   * from `clientData`. Naming what the tenant typed would report a success the
   * database has not confirmed, and would show the pre-normalization value
   * besides (hard rule #1, and #95's shape).
   *
   * The throw is re-raised so ClientFormModal still pins per-field messages
   * under their inputs and keeps itself open: the dialog says *that* it failed,
   * the form shows *where*. Swallowing it here would close the form over an
   * unsaved client.
   */
  const handleCreateClient = async (clientData: Partial<Client>) => {
    try {
      const saved = await addClient(
        clientData as Omit<Client, 'id' | 'created_at' | 'updated_at' | 'health_score'>
      );
      result.succeed({
        title: 'Cliente registrado',
        message: `${saved.name} ya está en tu directorio. Ya puedes cotizarle.`,
      });
    } catch (error) {
      result.fail(error, { title: 'No se guardó el cliente' });
      throw error;
    }
  };

  // Only scores that exist count (#276): `?? 100` counted every unscored
  // client into "Excelente" — the same invented 100 one aggregation up.
  const excellentCount = filteredClients.filter(
    (c) => typeof c.health_score === 'number' && c.health_score >= 90
  ).length;

  return (
    <div className="min-h-screen pb-12">
      <Header title="Directorio de Clientes" onNewClient={() => setIsModalOpen(true)} />

      <div className="px-4 py-6 md:px-8 text-white">
        {/* Top Summary & Search Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Directorio de Clientes</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Gestiona los datos de tus clientes, RFC para facturación SAT y enlaces de WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold px-4 py-2.5 text-sm shadow-md shadow-emerald-950/50 transition-all md:w-auto"
            >
              <Plus className="h-5 w-5" />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Nombre, RFC o Persona de Contacto..."
            aria-label="Buscar clientes"
              className="w-full min-h-[48px] rounded-2xl border border-slate-800 bg-slate-900/90 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Figures derived from a failed read are not figures (#260): "0
              Clientes" off a dropped request is a claim about the directory
              the app cannot back. */}
          {!error && (
            <div className="flex items-center gap-2">
              <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs font-bold text-slate-300 shadow-xl">
                <Users className="h-4 w-4 text-indigo-400" />
                <span>{filteredClients.length} Clientes</span>
              </div>

              <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-950/80 px-4 py-2.5 text-xs font-bold text-emerald-400 shadow-xl">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>{excellentCount} Excelente Score</span>
              </div>
            </div>
          )}
        </div>

        {/* Client Cards Grid. Three states, not two (#97/#260): a failed read
            used to render "No se encontraron clientes" with a "Registrar
            Cliente Ahora" CTA — the owner's worst case being re-registering a
            client that already exists. */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-800/80" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="mt-12 rounded-3xl border border-rose-500/30 bg-rose-950/60 p-12 text-center space-y-3">
            <Users className="mx-auto h-12 w-12 text-rose-400" />
            <h3 className="text-lg font-bold text-white">No pudimos cargar tu directorio</h3>
            <p className="mx-auto max-w-sm text-sm text-rose-200">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[48px] rounded-2xl bg-slate-800 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-slate-700 active:scale-95"
            >
              Reintentar
            </button>
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/90 p-12 text-center shadow-xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-950/80 text-indigo-400 border border-indigo-500/30">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-white">No se encontraron clientes</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              {searchQuery ? 'Prueba con otro término de búsqueda.' : 'Registra a tu primer cliente para comenzar a cotizar.'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 flex min-h-[48px] items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-md"
            >
              <Plus className="h-5 w-5" />
              <span>Registrar Cliente Ahora</span>
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreateClient}
      />

      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
  );
}

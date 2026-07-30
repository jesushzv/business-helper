'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { ClientCard } from '@/components/clients/ClientCard';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { useClients } from '@/lib/hooks/useClients';
import { Search, Users, Plus, ShieldCheck } from 'lucide-react';
import { Client } from '@/types';

export default function ClientsPage() {
  const { filteredClients, searchQuery, setSearchQuery, addClient, loading } = useClients();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateClient = async (clientData: Partial<Client>) => {
    await addClient(clientData as Omit<Client, 'id' | 'created_at' | 'updated_at' | 'health_score'>);
  };

  const excellentCount = filteredClients.filter((c) => (c.health_score ?? 100) >= 90).length;

  return (
    <div className="min-h-screen pb-12">
      <Header title="Directorio de Clientes" onNewClient={() => setIsModalOpen(true)} />

      <div className="px-4 py-6 md:px-8">
        {/* Top Summary & Search Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Directorio de Clientes</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Gestiona los datos de tus clientes, RFC para facturación SAT y enlaces de WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95 md:w-auto"
            >
              <Plus className="h-5 w-5" />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Nombre, RFC o Persona de Contacto..."
              className="w-full min-h-[48px] rounded-2xl border border-gray-200 bg-white pl-11 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 shadow-xs focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 shadow-xs">
              <Users className="h-4 w-4 text-indigo-600" />
              <span>{filteredClients.length} Clientes</span>
            </div>

            <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{excellentCount} Excelente Score</span>
            </div>
          </div>
        </div>

        {/* Client Cards Grid */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-200" />
            ))}
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Users className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-gray-900">No se encontraron clientes</h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              {searchQuery ? 'Prueba con otro término de búsqueda.' : 'Registra a tu primer cliente para comenzar a cotizar.'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-6 flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95"
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
    </div>
  );
}

'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { HealthScoreMeter } from '@/components/clients/HealthScoreMeter';
import { ActivityTimeline } from '@/components/clients/ActivityTimeline';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { useClients } from '@/lib/hooks/useClients';
import { generateWhatsAppLink } from '@/lib/whatsappLink';
import { formatClientActivity } from '@/lib/clientActivity';
import {
  ArrowLeft,
  Building2,
  User,
  Phone,
  Mail,
  FileText,
  MapPin,
  MessageSquare,
  Edit,
  Trash2,
  Clock,
} from 'lucide-react';
import { Client } from '@/types';

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getClientById, updateClient, deleteClient } = useClients();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const client = getClientById(id);

  if (!client) {
    return (
      <div className="min-h-screen">
        <Header title="Detalle de Cliente" />
        <div className="px-4 py-12 text-center md:px-8">
          <h3 className="text-xl font-bold text-gray-900">Cliente no encontrado</h3>
          <p className="mt-2 text-xs text-gray-500">El cliente solicitado no existe o fue eliminado.</p>
          <Link
            href="/dashboard/clients"
            className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Directorio</span>
          </Link>
        </div>
      </div>
    );
  }

  const handleUpdate = async (data: Partial<Client>) => {
    await updateClient(id, data);
  };

  const handleDelete = async () => {
    if (confirm(`¿Estás seguro de eliminar a ${client.name}?`)) {
      await deleteClient(id);
      router.push('/dashboard/clients');
    }
  };

  const waMessage = `Hola ${client.contact_name || client.name}, un gusto saludarte de Distribuidora del Norte.`;
  const whatsappUrl = generateWhatsAppLink(client.phone, waMessage);

  // Mock activity history feed
  const mockQuotes = [
    {
      id: 'q-101',
      title: 'Cotización Materiales Obra Civil',
      status: 'accepted',
      total_amount: 45000,
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const mockContracts = [
    {
      id: 'c-101',
      title: 'Contrato Suministro de Bloques y Varilla',
      status: 'accepted',
      total_amount: 45000,
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const mockMilestones = [
    {
      id: 'm-101',
      label: 'Anticipo 50% Obra Civil',
      status: 'confirmed',
      amount: 22500,
      due_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      confirmed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm-102',
      label: 'Liquidación Final 50%',
      status: 'pending',
      amount: 22500,
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const activityFeed = formatClientActivity(mockQuotes, mockContracts, mockMilestones);

  return (
    <div className="min-h-screen pb-16">
      <Header title={client.name} />

      <div className="px-4 py-6 md:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard/clients"
            className="flex min-h-[48px] items-center gap-2 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Directorio</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditOpen(true)}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 active:scale-95"
            >
              <Edit className="h-4 w-4" />
              <span>Editar</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 active:scale-95"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
          </div>
        </div>

        {/* Profile Card Header */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 font-black text-white shadow-md text-xl">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">{client.name}</h1>
                {client.contact_name && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    <User className="h-4 w-4 text-gray-400" />
                    <span>Contacto: {client.contact_name}</span>
                  </p>
                )}
                {client.notes && (
                  <p className="mt-2 text-xs font-medium text-gray-500">{client.notes}</p>
                )}
              </div>
            </div>

            {/* Direct WhatsApp Action Button */}
            {client.phone && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
              >
                <MessageSquare className="h-5 w-5" />
                <span>Contactar por WhatsApp</span>
              </a>
            )}
          </div>

          {/* Quick Contact & Tax Pills */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-6">
            {client.phone && (
              <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800">
                <Mail className="h-4 w-4 text-gray-400" />
                <span>{client.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">
              <FileText className="h-4 w-4 text-indigo-500" />
              <span>RFC: {client.rfc || 'Sin RFC registrado'}</span>
            </div>
            {client.codigo_postal && (
              <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span>CP: {client.codigo_postal}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Layout Grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: SAT Tax Profile & Health Score */}
          <div className="space-y-6">
            <HealthScoreMeter score={client.health_score ?? 100} milestones={mockMilestones} />

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs">
              <h3 className="text-base font-extrabold text-gray-900">Perfil Fiscal SAT (CFDI 4.0)</h3>
              <p className="mt-0.5 text-xs text-gray-500">Datos requeridos para facturación electrónica</p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs">
                  <span className="font-semibold text-gray-500">Régimen Fiscal</span>
                  <span className="font-bold text-gray-900">{client.regimen_fiscal || '601'}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs">
                  <span className="font-semibold text-gray-500">Uso de CFDI</span>
                  <span className="font-bold text-gray-900">{client.cfdi_use || 'G03'}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs">
                  <span className="font-semibold text-gray-500">Código Postal</span>
                  <span className="font-bold text-gray-900">{client.codigo_postal || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Chronological Activity Timeline */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900">Historial de Actividad</h3>
                  <p className="text-xs text-gray-500">Cotizaciones, contratos y cobranza del cliente</p>
                </div>
                <span className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{activityFeed.length} Eventos</span>
                </span>
              </div>

              <div className="mt-6">
                <ActivityTimeline items={activityFeed} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ClientFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleUpdate}
        initialClient={client}
      />
    </div>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Users, DollarSign, ArrowUpRight, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useClients } from '@/lib/hooks/useClients';

export default function DashboardPage() {
  const { clients } = useClients();

  return (
    <div className="min-h-screen pb-12">
      <Header title="Centro de Control" />

      <div className="px-4 py-6 md:px-8">
        {/* Welcome Banner */}
        <div className="rounded-3xl bg-linear-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <span className="rounded-full bg-indigo-700/60 px-3 py-1 text-xs font-bold tracking-wide uppercase">
                Panel de Administración
              </span>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                ¡Hola, Don Roberto!
              </h2>
              <p className="mt-1 max-w-xl text-xs font-medium text-indigo-200 sm:text-sm">
                Resumen ejecutivo de clientes, cotizaciones y cobranza pendiente en tiempo real.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/dashboard/clients"
                className="flex min-h-[48px] items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-950 shadow-md transition-all hover:bg-indigo-50 active:scale-95"
              >
                <Users className="h-4 w-4" />
                <span>Ver Clientes</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                Por Cobrar (Total)
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-black text-gray-900">$145,000.00 MXN</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>3 hitos por cobrar este mes</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                Cobrado este Mes
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-black text-gray-900">$210,500.00 MXN</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>+18% vs mes anterior</span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                Clientes Activos
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-black text-gray-900">{clients.length}</p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-700">
              <Users className="h-3.5 w-3.5" />
              <span>Directorio actualizado</span>
            </div>
          </div>
        </div>

        {/* Quick Links / Client Directory Highlights */}
        <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">Directorio de Clientes</h3>
              <p className="text-xs text-gray-500">Acceso rápido a perfiles y WhatsApp directo</p>
            </div>
            <Link
              href="/dashboard/clients"
              className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              <span>Ver todos</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {clients.slice(0, 3).map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 transition-all hover:bg-gray-100"
              >
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{client.name}</h4>
                  <p className="text-xs text-gray-500">
                    {client.contact_name ? `${client.contact_name} • ` : ''}RFC: {client.rfc || 'N/A'}
                  </p>
                </div>
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-xs hover:bg-indigo-50 hover:text-indigo-600"
                >
                  Ver Perfil
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

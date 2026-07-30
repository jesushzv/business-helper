'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, Plus, Bell } from 'lucide-react';

interface HeaderProps {
  onNewClient?: () => void;
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ onNewClient, title }) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white/95 px-4 shadow-xs backdrop-blur-md md:px-6">
      {/* Left Branding / View Title */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-indigo-600 transition-colors hover:text-indigo-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-xs">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="hidden text-xl font-bold tracking-tight text-gray-900 sm:inline-block">
            Business<span className="text-indigo-600">Helper</span>
          </span>
        </Link>
        {title && (
          <>
            <span className="hidden text-gray-300 sm:inline-block">/</span>
            <h1 className="text-lg font-bold text-gray-900 md:text-xl">{title}</h1>
          </>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {onNewClient && (
          <button
            onClick={onNewClient}
            className="flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
            aria-label="Nuevo Cliente"
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Nuevo Cliente</span>
          </button>
        )}

        <button
          className="flex h-12 w-12 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="flex h-12 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700 text-xs">
            DR
          </div>
          <div className="hidden text-left md:block">
            <p className="text-xs font-bold leading-none text-gray-900">Don Roberto</p>
            <p className="text-[10px] text-gray-500">Distribuidora Norte</p>
          </div>
        </div>
      </div>
    </header>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Plus, Bell, Zap, Layers } from 'lucide-react';
import { isDemoModeActive } from '@/lib/demoUtils';
import { FeatureTierComparisonModal } from '@/components/features/FeatureTierComparisonModal';

interface HeaderProps {
  onNewClient?: () => void;
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ onNewClient, title }) => {
  const [isDemo, setIsDemo] = useState(false);
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);

  useEffect(() => {
    setIsDemo(isDemoModeActive());
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 shadow-lg backdrop-blur-xl md:px-6">
        {/* Left Branding / View Title */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 transition-transform active:scale-95">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-400 to-teal-600 font-bold text-slate-950 shadow-md shadow-emerald-950/40">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="hidden text-xl font-black tracking-tight text-white sm:inline-block">
              Business<span className="text-emerald-400">Helper</span>
            </span>
          </Link>

          {title && (
            <>
              <span className="hidden text-slate-700 sm:inline-block">/</span>
              <h1 className="text-lg font-bold text-slate-100 md:text-xl">{title}</h1>
            </>
          )}

          {isDemo && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
              <Zap className="h-3 w-3 animate-pulse" />
              <span>DEMO</span>
            </span>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Tiers Modal Button */}
          <button
            onClick={() => setIsTierModalOpen(true)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-800 hover:text-white active:scale-95"
            title="Ver Planes y Funcionalidades"
          >
            <Layers className="h-4 w-4 text-emerald-400" />
            <span className="hidden md:inline">Planes</span>
          </button>

          {onNewClient && (
            <button
              onClick={onNewClient}
              className="flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-emerald-950/50 transition-all hover:bg-emerald-400 active:scale-95"
              aria-label="Nuevo Cliente"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo Cliente</span>
            </button>
          )}

          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
          </button>

          {/* User Profile Badge */}
          <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 font-extrabold text-emerald-400 text-xs border border-emerald-500/30">
              DR
            </div>
            <div className="hidden text-left md:block">
              <p className="text-xs font-bold leading-none text-white">Don Roberto</p>
              <p className="text-[10px] text-slate-400">Distribuidora Norte</p>
            </div>
          </div>
        </div>
      </header>

      {/* Feature & Tier Modal */}
      <FeatureTierComparisonModal
        isOpen={isTierModalOpen}
        onClose={() => setIsTierModalOpen(false)}
      />
    </>
  );
};


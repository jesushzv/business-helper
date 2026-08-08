'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, Zap, Layers, LogOut, UserCircle2 } from 'lucide-react';
import { isDemoModeActive } from '@/lib/demoUtils';
import { FeatureTierComparisonModal } from '@/components/features/FeatureTierComparisonModal';
import { getAssetUrl } from '@/lib/url';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';

/** "Ferretería La Central" → "FL"; a single word yields its first letter. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface HeaderProps {
  onNewClient?: () => void;
  title?: string;
  actionButton?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ onNewClient, title, actionButton }) => {
  const [isDemo, setIsDemo] = useState(false);
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { org, user, loading: orgLoading, signOut } = useCurrentOrg();

  useEffect(() => {
    setIsDemo(isDemoModeActive());
  }, []);

  useEffect(() => {
    if (!isProfileOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isProfileOpen]);

  // Who to show: the person when known, otherwise the business, otherwise
  // neutral chrome. Never the demo persona for a real tenant (#93).
  const displayName = user?.name || user?.email || org?.name || null;
  const secondaryLine = user?.name || user?.email ? org?.name || null : null;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 shadow-lg backdrop-blur-xl md:px-6">
        {/* Left Branding / View Title */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 transition-transform active:scale-95">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG logo; next/image does not optimize SVGs */}
            <img src={getAssetUrl('/logo-icon.svg')} alt="Business Helper" className="h-9 w-9 object-contain" />
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

          {actionButton}

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

          {/* User Profile Menu. The notifications bell that used to sit here
              had no onClick on any screen — removed until it does something. */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen((open) => !open)}
              aria-label="Mi cuenta"
              aria-expanded={isProfileOpen}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1 transition-colors hover:bg-slate-800"
            >
              {orgLoading ? (
                <div className="h-7 w-7 animate-pulse rounded-lg bg-slate-800" />
              ) : displayName ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 font-extrabold text-emerald-400 text-xs border border-emerald-500/30">
                  {initialsOf(displayName)}
                </div>
              ) : (
                <UserCircle2 className="h-7 w-7 text-slate-400" />
              )}
              {displayName && (
                <div className="hidden text-left md:block">
                  <p className="max-w-[140px] truncate text-xs font-bold leading-none text-white">
                    {displayName}
                  </p>
                  {secondaryLine && (
                    <p className="max-w-[140px] truncate text-[10px] text-slate-400">{secondaryLine}</p>
                  )}
                </div>
              )}
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-2xl">
                {displayName && (
                  <div className="border-b border-slate-800 px-3 pb-2 pt-1">
                    <p className="truncate text-xs font-bold text-white">{displayName}</p>
                    {user?.email && (
                      <p className="truncate text-[10px] text-slate-400">{user.email}</p>
                    )}
                  </div>
                )}
                <button
                  onClick={signOut}
                  className="mt-1 flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  <LogOut className="h-4 w-4 text-rose-400" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
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


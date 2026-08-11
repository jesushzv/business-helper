'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, Layers, UserPlus } from 'lucide-react';

interface DemoBannerProps {
  onOpenTierModal?: () => void;
}

/**
 * The offset every other sticky element must clear, published as a CSS
 * variable on the document root.
 *
 * This banner and the dashboard `Header` both stick to `top: 0`, and the
 * banner is earlier in the document with the higher z-index — so on the first
 * scroll the header (logo, page title, "Nuevo Cliente", notifications,
 * profile) slid underneath it and stayed hidden for the rest of the page
 * (#90). Demo mode is the marketing funnel's product tour, so that was what a
 * prospect evaluating on a phone saw on every dashboard page.
 *
 * The height is measured rather than hardcoded: the banner's contents wrap at
 * 375px, so it is ~46px on a desktop and taller on the phone where the
 * collision actually matters. A hardcoded constant would be wrong on exactly
 * the viewport this fixes.
 */
export const STICKY_OFFSET_VAR = '--bh-sticky-offset';

export const DemoBanner: React.FC<DemoBannerProps> = ({ onOpenTierModal }) => {
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const publish = () => {
      document.documentElement.style.setProperty(
        STICKY_OFFSET_VAR,
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Leaving demo mode must not leave every header pushed down.
      document.documentElement.style.removeProperty(STICKY_OFFSET_VAR);
    };
  }, []);

  return (
    <div
      ref={bannerRef}
      className="sticky top-0 z-50 w-full bg-linear-to-r from-emerald-950 via-slate-900 to-indigo-950 border-b border-emerald-500/30 px-4 py-2.5 shadow-lg backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs md:text-sm">
        {/* Left Indicator */}
        <div className="flex items-center gap-2 text-emerald-300 font-medium">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-white tracking-wide">MODO DEMOSTRACIÓN</span>
          <span className="hidden sm:inline text-slate-400">•</span>
          <span className="hidden sm:inline text-slate-300">
            Explorando Business Helper con datos de prueba de Don Roberto
          </span>
        </div>

        {/* Right Navigation & Action CTAs */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Back to Landing Link */}
          <Link
            href="/"
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white active:scale-95"
            title="Volver a la página principal"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs">Inicio</span>
          </Link>

          {/* Tier Features Button */}
          {onOpenTierModal && (
            <button
              onClick={onOpenTierModal}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-950/60 px-3 py-1.5 font-semibold text-indigo-300 transition-all hover:bg-indigo-900/80 hover:text-white active:scale-95"
            >
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs">Ver Planes y Beneficios</span>
            </button>
          )}

          {/* Sign Up CTA */}
          <Link
            href="/register"
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-linear-to-r from-emerald-500 to-teal-400 px-3.5 py-1.5 font-extrabold text-slate-950 shadow-md shadow-emerald-950/50 transition-all hover:from-emerald-400 hover:to-teal-300 active:scale-95"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="text-xs">Crear Mi Cuenta Gratis</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

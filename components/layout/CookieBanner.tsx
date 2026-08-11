'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cookie, X, CheckCircle2 } from 'lucide-react';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('bh_cookie_consent');
      if (!consent) {
        setIsVisible(true);
      }
    } catch {
      // Ignore localStorage access errors in private mode
    }
  }, []);

  const handleAccept = (type: 'all' | 'essential') => {
    try {
      localStorage.setItem('bh_cookie_consent', type);
    } catch {
      // Ignore localStorage errors
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de Cookies y Privacidad"
      className="fixed bottom-24 sm:bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 p-5 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl text-slate-200 animate-fadeIn"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
          <Cookie className="w-4 h-4" />
          <span>Aviso de Cookies y Privacidad LFPDPPP</span>
        </div>
        <button
          type="button"
          onClick={() => handleAccept('essential')}
          className="-m-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          aria-label="Cerrar aviso de cookies"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-4">
        Utilizamos cookies esenciales para garantizar la seguridad de tus sesiones y análisis anónimo de navegación conforme a la LFPDPPP en México.{' '}
        <Link href="/privacy" className="text-emerald-400 underline hover:text-emerald-300">
          Aviso de Privacidad
        </Link>{' '}
        y{' '}
        <Link href="/terms" className="text-emerald-400 underline hover:text-emerald-300">
          Términos de Servicio
        </Link>.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleAccept('all')}
          className="flex-1 min-h-[48px] py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Aceptar Todo</span>
        </button>
        <button
          type="button"
          onClick={() => handleAccept('essential')}
          className="flex-1 min-h-[48px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
        >
          Solo Esenciales
        </button>
      </div>
    </div>
  );
}

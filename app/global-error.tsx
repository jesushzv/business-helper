'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureException } from '@/lib/sentry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { route: 'global-root', level: 'fatal' });
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-white">
        <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <h1 className="text-xl font-black text-white tracking-tight sm:text-2xl">
            ¡Ocurrió un problema inesperado!
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Se ha producido un error del sistema. Nuestro equipo ha sido notificado automáticamente para resolverlo.
          </p>

          {error.digest && (
            <p className="mt-3 rounded-xl bg-slate-950 border border-slate-800 py-1.5 px-3 font-mono text-[11px] text-slate-400">
              Código de error: {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => reset()}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-98 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reintentar Cargar</span>
            </button>

            <a
              href="/dashboard"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white active:scale-98"
            >
              <Home className="h-4 w-4" />
              <span>Volver al Control</span>
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

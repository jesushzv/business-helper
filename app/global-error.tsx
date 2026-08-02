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
      <body className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans text-gray-900">
        <div className="max-w-md w-full rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <h1 className="text-xl font-black text-gray-900 tracking-tight sm:text-2xl">
            ¡Ocurrió un problema inesperado!
          </h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Se ha producido un error del sistema. Nuestro equipo ha sido notificado automáticamente para resolverlo.
          </p>

          {error.digest && (
            <p className="mt-3 rounded-xl bg-gray-100 py-1.5 px-3 font-mono text-[11px] text-gray-500">
              Código de error: {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => reset()}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-98"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reintentar Cargar</span>
            </button>

            <a
              href="/dashboard"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-98"
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

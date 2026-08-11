'use client';

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { captureException } from '@/lib/sentry';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { route: '/dashboard', level: 'error' });
  }, [error]);

  return (
    <div className="p-6 max-w-2xl mx-auto my-12 text-center">
      <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-8 shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 mb-4">
          <AlertCircle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-extrabold text-gray-900">
          No se pudo cargar esta sección
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Ocurrió un inconveniente al procesar los datos de tu negocio.
        </p>

        {error.digest && (
          <p className="mt-2 text-xs font-mono text-gray-400">
            Código de error: {error.digest}
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => reset()}
            className="flex min-h-[48px] items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-extrabold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-98"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

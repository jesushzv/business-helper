'use client';

import React, { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, Save, CheckCircle2, AlertCircle, Unplug } from 'lucide-react';

/**
 * PAC connection for CFDI 4.0 stamping.
 *
 * Nothing in the product used to reach a PAC: `/api/invoices/issue` fabricated
 * a folio and two URLs, so there was nothing to connect and no reason for this
 * card to exist. Real stamping needs an account somewhere, and per
 * docs/02-architecture/cfdi_integration_architecture.md §03 the account belongs
 * to the user: their CSD stays with their PAC, and Business Helper holds only
 * the API key — which they can revoke from the PAC's dashboard at any time.
 *
 * The key is write-only. Once saved, only its last four characters come back.
 */

interface PacConnection {
  provider: string;
  apiKeyHint: string;
  environment: 'sandbox' | 'live';
  connectedAt?: string;
}

interface FolioSummary {
  included: number;
  used: number;
  purchased: number;
  remaining: number;
  period: string;
  addOnPricePerFolio: number;
}

export const PacConnectionCard: React.FC = () => {
  const [connection, setConnection] = useState<PacConnection | null>(null);
  const [folios, setFolios] = useState<FolioSummary | null>(null);
  const [platformFallback, setPlatformFallback] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/organization/pac');
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // A 403 here just means the viewer is not the owner; that is not an
        // error worth shouting about on a settings page.
        if (res.status !== 403) {
          setError(data?.error?.message || 'No se pudo consultar tu conexión con el PAC');
        }
        return;
      }

      setConnection(data?.connection ?? null);
      setFolios(data?.folios ?? null);
      setPlatformFallback(Boolean(data?.platformFallbackAvailable));
    } catch {
      setError('No se pudo consultar tu conexión con el PAC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);

    try {
      const res = await fetch('/api/organization/pac', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message || 'No se pudo conectar tu PAC');
        return;
      }

      // Never keep the key in component state after it is stored.
      setApiKey('');
      setConnection(data.connection);
      setSaved('Tu PAC quedó conectado. Ya puedes timbrar facturas CFDI 4.0.');
      load();
    } catch {
      setError('No se pudo conectar tu PAC');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);

    try {
      const res = await fetch('/api/organization/pac', { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || 'No se pudo desconectar tu PAC');
        return;
      }

      setConnection(null);
      setSaved('Tu PAC quedó desconectado. Las facturas ya timbradas conservan su folio fiscal.');
    } catch {
      setError('No se pudo desconectar tu PAC');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 text-white">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 shadow-md">
          <FileCheck2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-white">
            Facturación CFDI 4.0 (PAC)
          </h3>
          <p className="text-xs text-slate-400">
            Conecta tu cuenta de Facturapi para timbrar facturas ante el SAT
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-950/70 p-4 text-xs text-slate-300 border border-slate-800">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Nunca almacenamos tus certificados SAT. Tus archivos CSD (.cer y .key) se quedan con tu
          PAC; aquí solo guardamos la llave de API, cifrada, y puedes revocarla desde tu PAC cuando
          quieras.
        </span>
      </div>

      {loading ? (
        <div className="mt-6 h-24 w-full animate-pulse rounded-2xl bg-slate-800/70" />
      ) : (
        <div className="mt-6 space-y-4">
          {saved && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/80 p-4 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{saved}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-950/80 p-4 text-xs font-bold text-rose-300 border border-rose-500/30">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {connection ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-white">
                    {connection.provider === 'facturapi' ? 'Facturapi' : connection.provider}{' '}
                    <span className="font-mono text-slate-400">····{connection.apiKeyHint}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {connection.environment === 'live'
                      ? 'Llave de producción: las facturas se timbran ante el SAT.'
                      : 'Llave de pruebas: los documentos que emitas no tienen validez fiscal.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/60 px-4 text-sm font-bold text-rose-300 transition-all hover:bg-rose-900/60 disabled:opacity-50"
                >
                  <Unplug className="h-4 w-4" />
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/60 p-4 text-xs font-bold text-amber-300">
              {platformFallback
                ? 'Sin PAC propio, tus facturas se timbran con la cuenta de Business Helper y consumen los folios incluidos en tu plan.'
                : 'Todavía no puedes emitir facturas CFDI: conecta tu llave de Facturapi para timbrar.'}
            </div>
          )}

          {folios && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
              <p className="font-bold text-white">Folios de tu plan ({folios.period})</p>
              <p className="mt-1">
                {folios.included} incluidos por mes · {folios.used} usados ·{' '}
                {folios.purchased} comprados · <strong>{folios.remaining} disponibles</strong>
              </p>
              <p className="mt-1 text-slate-500">
                Los folios solo se descuentan cuando timbras con la cuenta de Business Helper. Con
                tu propio PAC, tu proveedor te cobra directamente.
              </p>
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-3">
            <div>
              <label
                htmlFor="pac_api_key"
                className="block text-xs font-bold text-slate-300 uppercase tracking-wider"
              >
                Llave secreta de Facturapi
              </label>
              <input
                id="pac_api_key"
                type="password"
                name="pac_api_key"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                placeholder="sk_live_..."
                className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-indigo-500 focus:outline-none min-h-[48px] font-mono"
              />
              <p className="mt-1 text-xs text-slate-500">
                La encuentras en tu panel de Facturapi, en Configuración → Llaves de API.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || !apiKey}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-bold px-6 py-3.5 text-sm shadow-md transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Verificando con tu PAC...' : connection ? 'Actualizar llave' : 'Conectar mi PAC'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

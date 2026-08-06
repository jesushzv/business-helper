'use client';

import React, { useState, useEffect } from 'react';
import { Landmark, Save, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * SPEI settlement account for the organization.
 *
 * Unlike the other settings cards this does not go through
 * useOrganizationSettings: that hook mirrors into localStorage, and where a
 * tenant's customers send money is not something a browser store should be
 * authoritative for. Reads and writes go straight to /api/organization.
 */

interface BankAccount {
  bank_name: string;
  bank_clabe: string;
  bank_account_holder: string;
}

const EMPTY: BankAccount = { bank_name: '', bank_clabe: '', bank_account_holder: '' };

function formatClabe(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 18);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export const BankAccountCard: React.FC = () => {
  const [form, setForm] = useState<BankAccount>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/organization')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.organization) return;
        const org = data.organization;
        setForm({
          bank_name: org.bank_name || '',
          bank_clabe: org.bank_clabe ? formatClabe(org.bank_clabe) : '',
          bank_account_holder: org.bank_account_holder || '',
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === 'bank_clabe' ? formatClabe(value) : value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: form.bank_name,
          bankClabe: form.bank_clabe,
          bankAccountHolder: form.bank_account_holder,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error?.message || 'No se pudo guardar la cuenta bancaria');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('No se pudo guardar la cuenta bancaria');
    } finally {
      setSaving(false);
    }
  };

  const clabeDigits = form.bank_clabe.replace(/\D/g, '');
  const isConfigured = clabeDigits.length === 18 && form.bank_name.trim().length > 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 text-white">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-md">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-white">
            Cuenta Bancaria para Cobros SPEI
          </h3>
          <p className="text-xs text-slate-400">
            Sus clientes verán estos datos en la página de pago de cada cotización
          </p>
        </div>
      </div>

      {!loading && !isConfigured && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-950/70 p-4 text-xs font-bold text-amber-300 border border-amber-500/30">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Sin una CLABE configurada, sus enlaces de pago no muestran instrucciones y sus
            clientes no pueden pagarle por transferencia.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {saved && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/80 p-4 text-xs font-bold text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>La cuenta bancaria se guardó correctamente.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-2xl bg-rose-950/80 p-4 text-xs font-bold text-rose-300 border border-rose-500/30">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="bank_name" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Banco
          </label>
          <input
            id="bank_name"
            type="text"
            name="bank_name"
            value={form.bank_name}
            onChange={handleChange}
            required
            placeholder="BBVA México"
            className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px]"
          />
        </div>

        <div>
          <label htmlFor="bank_clabe" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            CLABE Interbancaria (18 dígitos)
          </label>
          <input
            id="bank_clabe"
            type="text"
            inputMode="numeric"
            name="bank_clabe"
            value={form.bank_clabe}
            onChange={handleChange}
            required
            placeholder="0121 8000 1234 5678 90"
            className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] font-mono"
          />
          <p className="mt-1 text-xs text-slate-500">{clabeDigits.length} de 18 dígitos</p>
        </div>

        <div>
          <label htmlFor="bank_account_holder" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Titular de la Cuenta (opcional)
          </label>
          <input
            id="bank_account_holder"
            type="text"
            name="bank_account_holder"
            value={form.bank_account_holder}
            onChange={handleChange}
            placeholder="Distribuidora del Norte S.A. de C.V."
            className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px]"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold px-6 py-3.5 text-sm shadow-md transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Cuenta Bancaria'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

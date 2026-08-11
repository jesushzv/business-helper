'use client';

import React, { useState, useEffect } from 'react';
import { Landmark, Save, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { formatClabe, normalizeClabe, isValidClabeLength } from '@/lib/clabe';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';
import { notifySettlementAccountChanged } from '@/lib/hooks/useSettlementAccount';

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

interface BankAccountCardProps {
  /**
   * Only an owner can write this row — `PATCH /api/organization` is scoped by
   * `owner_id`, so a member's save (or removal) matches no row and 404s with
   * "No se encontró una organización propia", which reads as *your business
   * does not exist*. Members see the account; they are not offered actions they
   * cannot complete (the CLAUDE.md corollary that decided #64's design).
   */
  canEdit: boolean;
}

export const BankAccountCard: React.FC<BankAccountCardProps> = ({ canEdit }) => {
  const [form, setForm] = useState<BankAccount>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [savedClabe, setSavedClabe] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/organization')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.organization) {
          // Unknown, not "no account" — same tri-state rule the settlement hook
          // follows. This card used to fall through here and render the amber
          // "Sin una CLABE configurada" warning at a tenant whose row does hold
          // one, asserting a fact from a failed read (#64/#96).
          setLoadFailed(true);
          return;
        }
        const org = data.organization;
        setForm({
          bank_name: org.bank_name || '',
          bank_clabe: org.bank_clabe ? formatClabe(org.bank_clabe) : '',
          bank_account_holder: org.bank_account_holder || '',
        });
        // What the *server* holds, kept apart from what is typed in the form:
        // the removal action is offered against the saved account, not against
        // whatever is in the inputs at the moment (#163).
        setSavedClabe(org.bank_clabe || null);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const result = useActionResult();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === 'bank_clabe' ? formatClabe(value) : value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    // Saving is not a way to remove. An empty CLABE is the API's clear signal,
    // so without this the save button becomes a second, unconfirmed removal —
    // announcing "tus cobros SPEI se depositarán en esta cuenta" for an account
    // that no longer exists. The input's `required` blocks this in a browser;
    // that is a client-side attribute guarding a money column, not a guarantee.

    if (normalizeClabe(form.bank_clabe).length === 0) {
      setError(
        'Para quitar la cuenta usa el botón "Quitar cuenta". Para guardarla, la CLABE debe tener 18 dígitos.'
      );
      return;
    }

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
        // Failure stays inline only: on this compact card the message renders
        // beside the very inputs it names, which beats a dialog covering them —
        // and showing both printed every error twice.
        setError(data?.error?.message || 'No se pudo guardar la cuenta bancaria');
        return;
      }

      // A 200 is not the save: the row that comes back must actually hold the
      // account that was sent. Without this, an unexpected body blanks
      // `savedClabe` — hiding "Quitar cuenta" for an account that does exist —
      // while announcing that SPEI will settle there.
      const savedRow = data?.organization;
      if (!savedRow || normalizeClabe(savedRow.bank_clabe || '') !== normalizeClabe(form.bank_clabe)) {
        setError('No se pudo confirmar la cuenta bancaria. Vuelve a cargar la página.');
        return;
      }

      // The CLABE is where every SPEI settles; its save deserves an explicit
      // confirmation, not a modal that just closes (#146's shape). The inline
      // `saved` state stays as the persistent marker next to the field.
      setSaved(true);
      setSavedClabe(savedRow.bank_clabe || null);
      setLoadFailed(false);
      setTimeout(() => setSaved(false), 3000);
      // The banner in the shell and the share actions on Cobranza/Facturación
      // read a hook that fetched once on mount and never remounts on a
      // client-side navigation, so without this they keep the pre-save answer
      // for the rest of the session (#163).
      notifySettlementAccountChanged();
      result.succeed({
        title: 'Cuenta bancaria guardada',
        message: 'Tus cobros SPEI se depositarán en esta cuenta.',
      });
    } catch {
      setError('No se pudo guardar la cuenta bancaria');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Removes the account (#163).
   *
   * An empty `bankClabe` is the API's explicit-clear signal; the route nulls
   * all three columns together. The form is repainted from the **server's**
   * answer rather than blanked optimistically, so a refused removal leaves the
   * account visible exactly as the row still holds it (hard rule #1).
   */
  const handleRemove = async () => {
    if (!canEdit) return;
    setSaving(true);
    setRemovalError(null);

    try {
      const res = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName: '', bankClabe: '', bankAccountHolder: '' }),
      });

      const data = await res.json().catch(() => ({}));

      // A 200 alone is not the removal: an unparseable body, an intermediary's
      // success page, or a row that came back still holding a CLABE would all
      // otherwise blank the form and announce a deletion the server did not do.
      if (!res.ok || !data?.organization || data.organization.bank_clabe) {
        setRemovalError(data?.error?.message || 'No se pudo quitar la cuenta bancaria');
        return;
      }

      const org = data.organization;
      setForm({
        bank_name: org.bank_name || '',
        bank_clabe: org.bank_clabe ? formatClabe(org.bank_clabe) : '',
        bank_account_holder: org.bank_account_holder || '',
      });
      setSavedClabe(org.bank_clabe || null);
      setConfirmingRemoval(false);
      setError(null);
      notifySettlementAccountChanged();
      result.succeed({
        title: 'Cuenta bancaria quitada',
        message:
          'Tus enlaces de pago ya no muestran instrucciones. Guarda una cuenta nueva cuando la tengas.',
      });
    } catch {
      setRemovalError('No se pudo quitar la cuenta bancaria');
    } finally {
      setSaving(false);
    }
  };

  const clabeDigits = normalizeClabe(form.bank_clabe);
  const isConfigured = isValidClabeLength(form.bank_clabe) && form.bank_name.trim().length > 0;

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

      {!loading && !loadFailed && !isConfigured && (
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

        {!canEdit && (
          <p className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs font-bold text-slate-400">
            Solo el dueño de la cuenta puede cambiar estos datos. Pídele que los actualice.
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || loading || !canEdit}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold px-6 py-3.5 text-sm shadow-md transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Cuenta Bancaria'}</span>
          </button>
        </div>
      </form>

      {/*
        Removal (#163). Offered only against an account the server actually
        holds, and only through a confirmation that says what stops working —
        this is where a tenant's clients send money, so "quitar" is not an
        action to fire on one tap.
      */}
      {canEdit && savedClabe && !confirmingRemoval && (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => setConfirmingRemoval(true)}
            disabled={saving}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-6 py-3.5 text-sm font-bold text-slate-300 transition-all hover:border-rose-500/40 hover:text-rose-300 active:scale-95 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>Quitar cuenta</span>
          </button>
        </div>
      )}

      {canEdit && savedClabe && confirmingRemoval && (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs font-bold text-rose-200">
              Si quitas esta cuenta, tus enlaces de pago dejarán de funcionar y tus clientes no
              podrán pagarte por transferencia hasta que guardes otra.
            </p>
          </div>
          {removalError && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-950/80 p-3 text-xs font-bold text-rose-200 border border-rose-500/40">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{removalError}</span>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-md transition-all hover:bg-rose-400 active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>{saving ? 'Quitando...' : 'Sí, quitar cuenta'}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemoval(false)}
              disabled={saving}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-6 py-3.5 text-sm font-bold text-slate-300 transition-all hover:text-white active:scale-95 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
  );
};

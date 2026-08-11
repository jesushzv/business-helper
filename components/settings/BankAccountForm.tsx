'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { formatClabe, normalizeClabe } from '@/lib/clabe';
import { validateBankAccount, type BankAccountFieldErrors, type BankAccount } from '@/lib/bankAccounts';
import type { BankAccountInputValues } from '@/lib/hooks/useBankAccounts';

/**
 * The add/edit form for one settlement account (#164).
 *
 * Shared by both actions because the rules are identical, and because a second
 * copy is how the two drift until one of them stops checking the CLABE.
 *
 * **Every message is pinned under the input it names.** The whole form is
 * validated per submit — never one problem at a time — and the first offending
 * input takes focus, so the message is on screen without scrolling. A banner
 * at the top of a form taller than a 375px viewport is a message the tenant has
 * to go looking for, which is #146's shape and not a message at all.
 */

interface BankAccountFormProps {
  /** The account being edited, or `null` to add a new one. */
  account: BankAccount | null;
  /** Resolves when the write is confirmed; rejects with the server's refusal. */
  onSubmit: (values: BankAccountInputValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

const FIELD_IDS: Record<string, string> = {
  label: 'bank_account_label',
  bankName: 'bank_account_bank_name',
  clabe: 'bank_account_clabe',
};

const inputClass =
  'mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-base font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px]';

/** Pinned under its own input, never collected into a banner. */
const FieldError: React.FC<{ message?: string; id: string }> = ({ message, id }) =>
  message ? (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-rose-300">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
      <span>{message}</span>
    </p>
  ) : null;

export const BankAccountForm: React.FC<BankAccountFormProps> = ({
  account,
  onSubmit,
  onCancel,
  submitLabel,
}) => {
  const [label, setLabel] = useState(account?.label || '');
  const [bankName, setBankName] = useState(account?.bank_name || '');
  const [clabe, setClabe] = useState(account?.clabe ? formatClabe(account.clabe) : '');
  const [accountHolder, setAccountHolder] = useState(account?.account_holder || '');

  const [fieldErrors, setFieldErrors] = useState<BankAccountFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Re-syncs when the form is pointed at a different account.
   *
   * `useState(prop)` keeps its first value forever, so without this, editing
   * one account and then another shows the first one's digits over the second
   * one's row — a CLABE beside a label it does not belong to (#95).
   */
  useEffect(() => {
    setLabel(account?.label || '');
    setBankName(account?.bank_name || '');
    setClabe(account?.clabe ? formatClabe(account.clabe) : '');
    setAccountHolder(account?.account_holder || '');
    setFieldErrors({});
    setFormError(null);
  }, [account]);

  /** Moves focus to the first field with a message, so it is on screen. */
  const focusFirstError = (errors: BankAccountFieldErrors) => {
    const first = (['label', 'bankName', 'clabe'] as const).find((name) => errors[name]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLInputElement>(`#${FIELD_IDS[first]}`);
    el?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const values: BankAccountInputValues = {
      label: label.trim(),
      bankName: bankName.trim(),
      clabe: normalizeClabe(clabe),
      accountHolder: accountHolder.trim(),
    };

    // Validated here with the same function the route uses, so the tenant sees
    // every problem before a round trip — and the server still re-validates,
    // because a client-side check is a convenience, not a gate on a money
    // column.
    const validation = validateBankAccount(values);
    if (!validation.ok) {
      setFieldErrors(validation.fields);
      setFormError(null);
      focusFirstError(validation.fields);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      await onSubmit(values);
    } catch (err) {
      // The server's refusal, keyed the same way: a field it names is pinned to
      // that input; anything else (403, 409, an outage) is stated once here.
      const fields = (err as { fields?: BankAccountFieldErrors })?.fields;
      if (fields && Object.keys(fields).length > 0) {
        setFieldErrors(fields);
        focusFirstError(fields);
      } else {
        setFormError((err as Error)?.message || 'No se pudo guardar la cuenta de cobro');
      }
    } finally {
      setSaving(false);
    }
  };

  const clabeDigits = normalizeClabe(clabe);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={FIELD_IDS.label} className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          Nombre de la cuenta
        </label>
        <input
          id={FIELD_IDS.label}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="BBVA obra"
          aria-invalid={Boolean(fieldErrors.label)}
          aria-describedby={fieldErrors.label ? `${FIELD_IDS.label}_error` : undefined}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-400">
          Para que distingas tus cuentas de un vistazo. Tus clientes no lo ven.
        </p>
        <FieldError message={fieldErrors.label} id={`${FIELD_IDS.label}_error`} />
      </div>

      <div>
        <label htmlFor={FIELD_IDS.bankName} className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          Banco
        </label>
        <input
          id={FIELD_IDS.bankName}
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="BBVA México"
          aria-invalid={Boolean(fieldErrors.bankName)}
          aria-describedby={fieldErrors.bankName ? `${FIELD_IDS.bankName}_error` : undefined}
          className={inputClass}
        />
        <FieldError message={fieldErrors.bankName} id={`${FIELD_IDS.bankName}_error`} />
      </div>

      <div>
        <label htmlFor={FIELD_IDS.clabe} className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          CLABE Interbancaria (18 dígitos)
        </label>
        <input
          id={FIELD_IDS.clabe}
          type="text"
          inputMode="numeric"
          value={clabe}
          onChange={(e) => setClabe(formatClabe(e.target.value))}
          placeholder="0121 8000 1234 5678 90"
          aria-invalid={Boolean(fieldErrors.clabe)}
          aria-describedby={fieldErrors.clabe ? `${FIELD_IDS.clabe}_error` : undefined}
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-slate-400">{clabeDigits.length} de 18 dígitos</p>
        <FieldError message={fieldErrors.clabe} id={`${FIELD_IDS.clabe}_error`} />
      </div>

      <div>
        <label
          htmlFor="bank_account_holder_name"
          className="block text-xs font-bold uppercase tracking-wider text-slate-300"
        >
          Titular de la cuenta (opcional)
        </label>
        <input
          id="bank_account_holder_name"
          type="text"
          value={accountHolder}
          onChange={(e) => setAccountHolder(e.target.value)}
          placeholder="Nombre tal como aparece en tu banco"
          className={inputClass}
        />
      </div>

      {/*
        Only for refusals that name no field — a 403, a 409, an outage. Field
        problems never reach here; they are pinned above, beside the input.
      */}
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/80 p-4 text-xs font-bold text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{formError}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-6 py-3.5 text-sm font-bold text-slate-300 transition-all hover:text-white active:scale-95 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
};

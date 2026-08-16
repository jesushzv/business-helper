'use client';

import React, { useEffect, useState } from 'react';
import { Landmark, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { MilestoneWithClient, ReceivableMutationOutcome } from '@/lib/hooks/useReceivables';
import { normalizeNumericInput, parseNumericInput } from '@/lib/numericInput';
import { expectedSettlementAmount, recordedTransferAmount } from '@/lib/receivablesCalculator';
import { localTodayStr, formatDateOnlyEs } from '@/lib/dates';

interface RecordPaymentModalProps {
  isOpen: boolean;
  milestone: MilestoneWithClient | null;
  onClose: () => void;
  onRecord: (
    milestoneId: string,
    payment: { amount: number; trackingReference?: string | null; declaredAt?: string | null }
  ) => Promise<ReceivableMutationOutcome>;
}

const mxn = (value: number) =>
  value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

/**
 * Registrar pago — the owner enters money they saw arrive (#394, option A).
 *
 * The distinction this modal exists to make, and the reason it is not just a
 * field on the confirm dialog: the amount here is **one payment**, not the
 * total received. `milestone_payments` is append-only, so a total typed over
 * the top of it inflates the ledger — an owner correcting 20,000 → 25,000
 * would leave it reading 45,000. The database does the addition; this screen
 * says so in the copy, because "monto recibido" and "este pago" being confused
 * is the whole defect.
 *
 * Mobile-first per Don Roberto: 48px targets, 16px inputs (below that iOS zooms
 * on focus), and a decimal keypad rather than a spinner (#151).
 */
export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  milestone,
  onClose,
  onRecord,
}) => {
  const [amount, setAmount] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [declaredAt, setDeclaredAt] = useState(localTodayStr());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (milestone) {
      // Nothing is prefilled. The wire that just landed is rarely the whole
      // cobro — that is the case this modal exists for — and a prefilled
      // settlement figure is a suggestion to record money that may not have
      // arrived (#44's absent-is-absent rule, on an input).
      setAmount('');
      setTrackingReference('');
      setDeclaredAt(localTodayStr());
      setErrorMessage(null);
    }
  }, [milestone]);

  if (!isOpen || !milestone) return null;

  const settlement = expectedSettlementAmount(milestone);
  const alreadyRecorded = recordedTransferAmount(milestone);
  const outstanding = Math.max(settlement - alreadyRecorded, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const declared = parseNumericInput(amount);
    if (amount.trim() === '' || !Number.isFinite(declared) || declared <= 0) {
      setErrorMessage('Escribe el monto que recibiste, mayor a cero.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const outcome = await onRecord(milestone.id, {
        amount: declared,
        trackingReference: trackingReference.trim() || null,
        // Date-only from the picker; the hour is not something the owner knows
        // and inventing one would date the payment more precisely than the fact.
        declaredAt: declaredAt ? new Date(`${declaredAt}T12:00:00`).toISOString() : null,
      });

      if (!outcome.success) {
        // A refused write stays on screen with its reason. Closing here would
        // report a payment the ledger never took (#58/#86).
        setErrorMessage(outcome.error || 'No se pudo registrar el pago');
        return;
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Registrar pago recibido">
      <form onSubmit={handleSubmit} className="space-y-5 text-white">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
          <p className="text-sm font-bold text-white">{milestone.label}</p>
          <p className="text-xs text-slate-400">{milestone.client_name}</p>

          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-400">Total del cobro</dt>
              <dd className="font-mono font-bold text-slate-200">{mxn(settlement)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Ya registrado</dt>
              <dd className="font-mono font-bold text-slate-200">{mxn(alreadyRecorded)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-1">
              <dt className="font-bold text-slate-300">Falta por cubrir</dt>
              <dd className="font-mono text-base font-extrabold text-emerald-400">
                {mxn(outstanding)}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <label
            htmlFor="recordpayment-monto"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
          >
            Monto de este pago (MXN)
          </label>
          <input
            id="recordpayment-monto"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(normalizeNumericInput(e.target.value))}
            placeholder="0.00"
            className="w-full min-h-[48px] px-4 py-3 border border-slate-800 bg-slate-950/80 rounded-xl font-bold font-mono text-lg text-white focus:border-emerald-500 outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Solo lo que llegó en esta transferencia. Si el cliente paga en partes, registra cada
            pago por separado.
          </p>
        </div>

        <div>
          <label
            htmlFor="recordpayment-fecha"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
          >
            ¿Cuándo llegó?
          </label>
          <input
            id="recordpayment-fecha"
            type="date"
            value={declaredAt}
            max={localTodayStr()}
            onChange={(e) => setDeclaredAt(e.target.value)}
            className="w-full min-h-[48px] px-4 py-3 border border-slate-800 bg-slate-950/80 rounded-xl text-base font-medium text-white focus:border-emerald-500 outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            La fecha real del depósito, no la de hoy: es la que lleva tu factura de pago
            {declaredAt ? ` (${formatDateOnlyEs(declaredAt)})` : ''}.
          </p>
        </div>

        <div>
          <label
            htmlFor="recordpayment-clave"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
          >
            Clave de rastreo (opcional)
          </label>
          <input
            id="recordpayment-clave"
            type="text"
            value={trackingReference}
            onChange={(e) => setTrackingReference(e.target.value)}
            placeholder="Ej. SPEI20260830123456"
            className="w-full min-h-[48px] px-4 py-3 border border-slate-800 bg-slate-950/80 rounded-xl font-mono text-sm text-white uppercase focus:border-emerald-500 outline-none"
          />
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-red-500/40 bg-red-950/60 p-4 text-sm font-medium text-red-200"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 rounded-xl border border-slate-700 text-sm font-bold text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[48px] px-6 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Landmark className="w-5 h-5" />
                Registrando…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Registrar pago
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

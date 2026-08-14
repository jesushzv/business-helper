'use client';

import React, { useState } from 'react';
import { MilestoneWithClient, ReceivableMutationOutcome } from '@/lib/hooks/useReceivables';
import { CheckCircle, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { normalizeNumericInput, numericInputValue, parseNumericInput } from '@/lib/numericInput';
import { expectedSettlementAmount } from '@/lib/receivablesCalculator';

interface SpeiConfirmModalProps {
  isOpen: boolean;
  milestone: MilestoneWithClient | null;
  onClose: () => void;
  onConfirm: (milestoneId: string, transferredAmount?: number) => Promise<ReceivableMutationOutcome>;
}

export const SpeiConfirmModal: React.FC<SpeiConfirmModalProps> = ({
  isOpen,
  milestone,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [complementWarning, setComplementWarning] = useState<string | null>(null);
  // Held as the typed text, not a number, so "cleared" and "zero" stay
  // distinguishable: `Number(x) || milestone.amount` substituted the FULL
  // amount for anything falsy, and a cleared field displayed 0 while confirming
  // the whole cobro — screen and write disagreeing about money (#284). #151
  // finishes the job at the input itself: `type="number"` blanked the field
  // mid-decimal and let `0150` through, so the field is now text with a
  // decimal keypad and every keystroke goes through `normalizeNumericInput`.
  //
  // The prefill stays. Confirming a SPEI means agreeing with the amount the
  // milestone expects far more often than correcting it, and the defect here
  // was never the default — it was the round-trip through `parseFloat`.
  //
  // What it defaults *to* changed in #341. `milestone.amount` is the
  // contractual figure; `expectedSettlementAmount` is what the stamped invoice
  // says, which is what the complemento de pago measures its balance against.
  // Where the PAC's recomputed total came out a centavo under the milestone —
  // its own comment says it can — a client paying exactly what this modal
  // proposed tripped the #81 overpayment notice, and the product told Don
  // Roberto to refund $0.01.
  //
  // `transferred_amount` still wins when it is set: `/pay/[token]` records the
  // payer's own declaration there before the owner ever opens this modal, and
  // a figure someone stated about money that moved outranks any expectation.
  const [transferredAmount, setTransferredAmount] = useState<string>(
    numericInputValue(milestone?.transferred_amount ?? expectedSettlementAmount(milestone))
  );

  React.useEffect(() => {
    if (milestone) {
      setTransferredAmount(
        numericInputValue(milestone.transferred_amount ?? expectedSettlementAmount(milestone))
      );
      setErrorMessage(null);
      setComplementWarning(null);
    }
  }, [milestone]);

  if (!isOpen || !milestone) return null;

  const handleConfirm = async () => {
    // What arrived is the tenant's declaration, and it is what the complemento
    // de pago will carry to the SAT. An unreadable one is a question, not a
    // default.
    const declared = parseNumericInput(transferredAmount);
    if (transferredAmount.trim() === '' || !Number.isFinite(declared) || declared <= 0) {
      setErrorMessage(
        'Indica el monto que recibiste, mayor a cero. Si no llegó nada, no confirmes el pago.'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const outcome = await onConfirm(milestone.id, declared);

      if (!outcome.success) {
        // The payment was NOT confirmed. Say so where the user is looking,
        // instead of closing over a state the server rejected.
        setErrorMessage(outcome.error || 'No se pudo confirmar el pago');
        return;
      }

      if (outcome.complementError) {
        // The payment confirmed but the SAT complement did not stamp — a live
        // fiscal obligation the user must retry from Facturación. Hold the
        // modal open until they have seen it.
        setComplementWarning(outcome.complementError.message);
        return;
      }

      // Two facts the modal must not close over, held in one amber block so
      // neither swallows the other. The overpayment (#81): the complement
      // declares only the balance — the surplus is real money in the bank
      // that no document mentions. The storage warning (#238): the complement
      // stamped at the SAT but its XML/PDF copies could not be saved, which
      // the tenant would otherwise first learn from the accountant export.
      const warnings: string[] = [];

      const overpaid = Number(outcome.complement?.overpaidAmount) || 0;
      if (overpaid > 0) {
        const formatted = new Intl.NumberFormat('es-MX', {
          style: 'currency',
          currency: 'MXN',
        }).format(overpaid);
        warnings.push(
          `Se recibieron ${formatted} por encima del saldo de esta factura. ` +
            'El complemento se timbró por el saldo; aplica el excedente a otro cobro o devuélvelo a tu cliente.'
        );
      }

      if (outcome.complement?.warning) {
        warnings.push(String(outcome.complement.warning));
      }

      if (warnings.length > 0) {
        setComplementWarning(warnings.join(' '));
        return;
      }

      onClose();
    } finally {
      setLoading(false);
    }
  };

  // The same figure the field is prefilled with. Showing "Monto Esperado:
  // $10,000.00" above a field holding 9,999.99 invites the owner to "correct"
  // the field back to the milestone amount and re-create the centavo (#341).
  const formattedAmount = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(expectedSettlementAmount(milestone));

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirmación de Pago SPEI"
      // A confirmed amount typed here writes money state; a stray backdrop tap
      // must not discard it.
      dismissOnBackdrop={false}
      panelClassName="p-6"
    >
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 pr-12">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            <span>Confirmación de Pago SPEI</span>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase">Concepto de Cobro</span>
            <h4 className="text-base font-bold text-white">{milestone.label}</h4>
            <p className="text-sm text-slate-300 font-medium">{milestone.client_name}</p>
            <div className="mt-2 text-xl font-black font-mono text-emerald-400">Monto Esperado: {formattedAmount}</div>
          </div>

          {/* SPEI Details if uploaded */}
          {milestone.tracking_reference && (
            <div className="bg-indigo-950/80 p-4 rounded-2xl border border-indigo-500/30 space-y-1">
              <span className="text-xs font-bold text-indigo-400 uppercase">Clave de Rastreo (Banxico)</span>
              <p className="font-mono text-base font-bold text-indigo-200 break-all">{milestone.tracking_reference}</p>
            </div>
          )}

          {/* A blob: URL dereferences only in the payer's own browser tab —
              rendering one gives the vendor a dead "receipt" link (#85). Rows
              written by pre-#85 clients may still carry them. */}
          {milestone.receipt_url && !milestone.receipt_url.startsWith('blob:') && (
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase mb-1 block">Comprobante Adjunto</span>
              <a
                href={milestone.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium text-sm transition-colors min-h-[48px] w-full justify-center"
              >
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <span>Ver Comprobante de Transferencia</span>
              </a>
            </div>
          )}

          <div>
            <label htmlFor="speiconfirmmodal-monto-transferido-confirmado-mxn" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Monto Transferido Confirmado (MXN)
            </label>
            <input
              id="speiconfirmmodal-monto-transferido-confirmado-mxn"
              type="text"
              inputMode="decimal"
              value={transferredAmount}
              onChange={(e) => setTransferredAmount(normalizeNumericInput(e.target.value))}
              className="w-full min-h-[48px] px-4 py-3 border border-slate-800 bg-slate-950/80 rounded-xl font-bold font-mono text-lg text-white focus:border-emerald-500 outline-none"
            />
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 bg-red-950/60 border border-red-500/40 text-red-200 rounded-2xl p-4 text-sm font-medium"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {complementWarning ? (
          <div className="space-y-3 pt-2">
            <div
              role="alert"
              className="flex items-start gap-2 bg-amber-950/60 border border-amber-500/40 text-amber-200 rounded-2xl p-4 text-sm font-medium"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
              <span>{complementWarning}</span>
            </div>
            <button
              onClick={onClose}
              className="w-full min-h-[48px] px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <CheckCircle className="w-5 h-5" />
              <span>Entendido — pago confirmado</span>
            </button>
          </div>
        ) : (
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md"
            >
              {loading ? (
                <span>Confirmando...</span>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Confirmar Pago</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

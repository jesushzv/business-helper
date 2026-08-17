'use client';

import React, { useState } from 'react';
import { MilestoneWithClient, ReceivableMutationOutcome } from '@/lib/hooks/useReceivables';
import { CheckCircle, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { normalizeNumericInput, numericInputValue, parseNumericInput } from '@/lib/numericInput';
import { expectedSettlementAmount, remainingToRecord } from '@/lib/receivablesCalculator';

/** Mirrors the bucket's own 5 MB limit and `lib/speiValidator.ts`. */
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

interface SpeiConfirmModalProps {
  isOpen: boolean;
  milestone: MilestoneWithClient | null;
  onClose: () => void;
  onConfirm: (milestoneId: string, transferredAmount?: number) => Promise<ReceivableMutationOutcome>;
  /**
   * Files the comprobante the client sent over WhatsApp, on their behalf (#339).
   *
   * Optional: without it the modal shows no upload control at all, rather than
   * one that cannot work.
   */
  onUploadReceipt?: (milestoneId: string, file: File) => Promise<ReceivableMutationOutcome>;
}

/**
 * `null` without a milestone, so the field renders empty rather than `0`.
 *
 * The subtraction itself moved to `lib/receivablesCalculator.ts` when
 * `pickPayableMilestone` came to need the same answer (#382): two copies of an
 * arithmetic over money is how one of them ends up reading the wrong base.
 */
function prefillAmount(milestone: MilestoneWithClient | null): number | null {
  return milestone ? remainingToRecord(milestone) : null;
}

export const SpeiConfirmModal: React.FC<SpeiConfirmModalProps> = ({
  isOpen,
  milestone,
  onClose,
  onConfirm,
  onUploadReceipt,
}) => {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * The stored receipt, as the server last reported it.
   *
   * Held here rather than read straight off the prop because the page owns
   * `selectedMilestone` in its own state: after a successful upload the hook's
   * list has the new URL but this prop does not, so the modal would keep
   * showing "no hay comprobante" for a file that is filed. Seeded from the
   * prop and only ever replaced by the row a mutation returned — never by a
   * URL built here (#85).
   */
  const [receiptUrl, setReceiptUrl] = useState<string | null | undefined>(milestone?.receipt_url);
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
  // What is left to cover, not the whole cobro (#394). The figure typed here is
  // now recorded as **a payment** — `useReceivables.confirmPayment` appends it
  // to the ledger before confirming — so proposing the full settlement total on
  // a cobro that already carries $4,000 would record that $4,000 a second time.
  //
  // The base is what has been **recorded**, not `outstandingAmount`: that one
  // subtracts `collectedAmount`, which is 0 on anything not yet `confirmed` —
  // and every cobro this modal opens is by definition not yet confirmed. Using
  // it would have proposed the full total on a cobro the payer had already
  // declared against, which is the doubling this whole change exists to stop.
  // (Caught by the #341 case that pins the payer's declared figure.)
  const [transferredAmount, setTransferredAmount] = useState<string>(
    numericInputValue(prefillAmount(milestone))
  );

  React.useEffect(() => {
    if (milestone) {
      setTransferredAmount(numericInputValue(prefillAmount(milestone)));
      setErrorMessage(null);
      setComplementWarning(null);
      setUploadError(null);
      setReceiptUrl(milestone.receipt_url);
    }
  }, [milestone]);

  const handleUpload = async (file: File) => {
    if (!onUploadReceipt || !milestone) return;
    setUploadError(null);

    // Said here rather than left to the server. A phone photo over the limit
    // exceeds Vercel's request-body cap before the route's own check runs, so
    // the answer comes back as a non-JSON error and reduces to a generic "no
    // se pudo subir" that never mentions size. The payer-facing page states
    // the limit up front for the same reason.
    if (file.size > MAX_RECEIPT_BYTES) {
      setUploadError(
        'El archivo pesa más de 5 MB. Toma la foto en menor calidad o sube el PDF del banco.'
      );
      return;
    }

    setUploading(true);
    try {
      const outcome = await onUploadReceipt(milestone.id, file);
      if (!outcome.success) {
        // A failed upload is reported as a failure, full stop. The defect this
        // route was hardened against (#85) was exactly the opposite.
        setUploadError(outcome.error || 'No se pudo subir el comprobante');
        return;
      }
      // The server row, never a locally built URL.
      setReceiptUrl(outcome.milestone?.receipt_url ?? null);
    } finally {
      setUploading(false);
    }
  };

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
          {receiptUrl && !receiptUrl.startsWith('blob:') && (
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase mb-1 block">Comprobante Adjunto</span>
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium text-sm transition-colors min-h-[48px] w-full justify-center"
              >
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <span>Ver Comprobante de Transferencia</span>
              </a>
            </div>
          )}

          {/* Filing the comprobante the client sent over WhatsApp, on their
              behalf (#339). The authenticated upload route existed with no
              caller: only the payer could ever attach evidence, so a receipt
              that arrived as a WhatsApp image had nowhere to go.

              Deliberately **no** `capture` attribute. It reads like "offer the
              camera too", but it tells the UA to *use* the capture device —
              Chrome on Android and iOS Safari open the camera straight away and
              skip the photo library and the Files picker. The receipt is
              already in the gallery, having arrived over WhatsApp, and a PDF
              would be unreachable entirely. */}
          {onUploadReceipt && (
            <div>
              <label
                htmlFor="speiconfirmmodal-comprobante"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
              >
                {receiptUrl ? 'Reemplazar comprobante' : 'Subir comprobante'}
              </label>
              <input
                id="speiconfirmmodal-comprobante"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // The input is cleared so picking the same file twice after a
                  // failure still fires a change event.
                  e.target.value = '';
                  if (file) void handleUpload(file);
                }}
                // The `file:` button is the actual tap target — the label
                // beside it is not clickable on iOS — so it carries the 48px
                // floor itself, and the wrapper grows to hold it rather than
                // the button being squeezed to fit a 48px wrapper.
                className="flex w-full min-h-[64px] items-center rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm font-medium text-slate-300 file:mr-3 file:min-h-[48px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:text-xs file:font-bold file:text-white hover:file:bg-slate-700 disabled:opacity-60"
              />
              <p className="mt-1 text-xs font-medium text-slate-500">
                Foto o PDF del comprobante que te mandó tu cliente.
              </p>
              {uploading && (
                <p className="mt-1 text-xs font-bold text-indigo-300">Subiendo comprobante...</p>
              )}
              {uploadError && (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs font-medium text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{uploadError}</span>
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="speiconfirmmodal-monto-transferido-confirmado-mxn" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Monto de este pago (MXN)
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
          /* Both are held while an upload is in flight. Closing the modal
             mid-upload left the request running with nowhere to report to: a
             green "Pago confirmado" appeared and the owner was never told the
             comprobante had not been filed (#339 review). */
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-sm transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || uploading}
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

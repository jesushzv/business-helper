'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

/**
 * The confirmation step in front of an action that cannot be undone.
 *
 * Three irreversible actions ran on a single unconfirmed tap (#99): stamping
 * a CFDI (spends a folio and creates a SAT obligation, with no in-app cancel),
 * disconnecting the PAC (the API key is write-only, so reconnecting means
 * re-finding it at Facturapi), and deleting a catalogue product. The only
 * confirmation anywhere was a native `confirm()` on client delete — an OS
 * dialog whose buttons render in the *device* language, outside this app's
 * design and its Mexican-Spanish copy rules (hard rule #8).
 *
 * What makes this worth a component rather than a `window.confirm`:
 *
 * - **The consequence is a required prop.** Not "¿Estás seguro?" — the actual
 *   cost, in plain Spanish, named before the tap: *"Tu PAC te cobrará este
 *   timbrado y la factura quedará registrada ante el SAT."* A confirmation that does not say
 *   what will happen is a speed bump, not a decision point.
 * - It inherits everything from `Modal`: dialog role, Escape, focus trap,
 *   48px targets, height containment.
 * - The confirm button owns the in-flight state, so the dialog cannot be
 *   double-fired while the request is in the air.
 *
 * `useConfirm()` at the bottom wires it in three lines.
 */

export interface ConfirmRequest {
  title: string;
  /**
   * What will happen, in plain Spanish. Required: this is the whole point of
   * the dialog, and a caller with nothing to say here does not need one.
   */
  consequence: string;
  /** The affirmative button. Name the action — never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive styling. `false` for a merely-irreversible action. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ request, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh confirmation starts clean — the previous action's failure must not
  // greet an unrelated question.
  useEffect(() => setError(null), [request]);

  if (!request) return null;

  const destructive = request.destructive !== false;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm();
      onClose();
    } catch (err) {
      // A rejected onConfirm used to escape as an unhandled rejection: the
      // dialog sat re-enabled, the Spanish message the API produced reached no
      // surface, and "Sí, eliminar" did nothing forever (#262). The failure
      // renders here, in the dialog that asked for the action.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo completar la acción. Intenta de nuevo.'
      );
    } finally {
      // The dialog may already be unmounted by onClose; setting state on an
      // unmounted component is a no-op in React 19, and leaving `busy` true
      // would otherwise strand the button if onConfirm threw.
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={request.title}
      maxWidth="max-w-sm"
      // A tap outside must not be a way to answer this.
      dismissOnBackdrop={false}
      hideCloseButton
      role="alertdialog"
      panelClassName="p-6 text-center"
      data-testid="confirm-dialog"
    >
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${
          destructive
            ? 'border-rose-500/30 bg-rose-950/80 text-rose-400'
            : 'border-amber-500/30 bg-amber-950/80 text-amber-400'
        }`}
      >
        <AlertTriangle className="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-lg font-extrabold text-white">{request.title}</h3>
      <p className="mt-1.5 text-sm text-slate-300">{request.consequence}</p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-500/30 bg-rose-950/60 p-3 text-xs font-semibold text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`min-h-[48px] w-full rounded-xl px-5 text-sm font-bold active:scale-95 disabled:opacity-60 ${
            destructive
              ? 'bg-rose-500 text-white hover:bg-rose-400'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          }`}
        >
          {busy ? 'Procesando…' : request.confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-800 px-5 text-sm font-bold text-slate-200 hover:bg-slate-700 active:scale-95 disabled:opacity-60"
        >
          {request.cancelLabel || 'Cancelar'}
        </button>
      </div>
    </Modal>
  );
};

/**
 * State for the dialog.
 *
 *   const confirm = useConfirm();
 *   ...
 *   confirm.ask({
 *     title: 'Timbrar factura ante el SAT',
 *     consequence: 'Tu PAC te cobrará este timbrado y la factura quedará registrada ante el SAT.',
 *     confirmLabel: 'Timbrar factura',
 *     onConfirm: () => handleStamp(id),
 *   });
 *   ...
 *   <ConfirmDialog request={confirm.request} onClose={confirm.dismiss} />
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  return {
    request,
    ask: (r: ConfirmRequest) => setRequest(r),
    dismiss: () => setRequest(null),
  };
}

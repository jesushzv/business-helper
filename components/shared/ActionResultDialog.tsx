'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

/**
 * The confirmation an action gives back — success or failure — for the whole app.
 *
 * Registering a client gave neither. On success the modal simply closed, which
 * on a phone is indistinguishable from the tap not registering; on failure the
 * message went into a banner at the top of a form already scrolled past. #146
 * was reported as "I can't get past registration" partly because *nothing ever
 * said what had happened*.
 *
 * So this is deliberately one component covering both outcomes, not a toast for
 * the happy path and something else for errors. A tenant on a 375px screen who
 * just tapped *Guardar* needs the same thing either way: a clear statement of
 * what happened, and the next move.
 *
 * **Honesty (hard rule #1).** `succeed()` takes the record the *server*
 * returned. It is not reachable from an optimistic local object, and nothing
 * here can be shown before a write is confirmed — a success dialog is a claim,
 * and this repo's dominant defect class is claims the system has not earned.
 * `tests/components/ActionResultDialog.test.tsx` pins that shape.
 */

export type ActionOutcome = 'success' | 'error';

export interface ActionResult {
  outcome: ActionOutcome;
  title: string;
  /** One or two sentences, Mexican Spanish, plain language (hard rule 8). */
  message: string;
  /** Per-field messages from an API envelope, rendered as a list under the message. */
  fields?: Record<string, string>;
  /** Optional extra action, e.g. "Ver cliente" or "Crear cotización". */
  action?: { label: string; onClick: () => void };
}

interface ActionResultDialogProps {
  result: ActionResult | null;
  onClose: () => void;
  /** Label for the dismiss button. Defaults to a plain acknowledgement. */
  closeLabel?: string;
}

const STYLES: Record<
  ActionOutcome,
  { ring: string; iconWrap: string; icon: typeof CheckCircle2; button: string }
> = {
  success: {
    ring: 'border-emerald-500/30',
    iconWrap: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30',
    icon: CheckCircle2,
    button: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
  },
  error: {
    ring: 'border-rose-500/30',
    iconWrap: 'bg-rose-950/80 text-rose-400 border-rose-500/30',
    icon: AlertCircle,
    button: 'bg-slate-700 hover:bg-slate-600 text-white',
  },
};

export const ActionResultDialog: React.FC<ActionResultDialogProps> = ({
  result,
  onClose,
  closeLabel = 'Entendido',
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the dismiss button so the dialog is reachable by keyboard and
  // announced by a screen reader the moment it appears.
  useEffect(() => {
    if (result) closeRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [result, onClose]);

  if (!result) return null;

  const style = STYLES[result.outcome];
  const Icon = style.icon;
  const fieldMessages = Object.entries(result.fields || {});

  return (
    <div
      data-testid="result-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md"
      // Clicking the backdrop dismisses; clicks inside must not bubble to it.
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-result-title"
        aria-describedby="action-result-message"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-sm rounded-3xl border ${style.ring} bg-slate-900 p-6 text-center shadow-2xl`}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border ${style.iconWrap}`}
        >
          <Icon className="h-7 w-7" />
        </div>

        <h3 id="action-result-title" className="mt-4 text-lg font-extrabold text-white">
          {result.title}
        </h3>
        <p id="action-result-message" className="mt-1.5 text-sm text-slate-300">
          {result.message}
        </p>

        {fieldMessages.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-left">
            {fieldMessages.map(([field, message]) => (
              <li key={field} className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-300">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {result.action && (
            <button
              onClick={() => {
                result.action?.onClick();
                onClose();
              }}
              className={`min-h-[48px] w-full rounded-xl px-5 text-sm font-bold active:scale-95 ${style.button}`}
            >
              {result.action.label}
            </button>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            className={
              result.action
                ? 'min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-800 px-5 text-sm font-bold text-slate-200 hover:bg-slate-700 active:scale-95'
                : `min-h-[48px] w-full rounded-xl px-5 text-sm font-bold active:scale-95 ${style.button}`
            }
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * State for the dialog, so a page wires it in three lines.
 *
 *   const result = useActionResult();
 *   ...
 *   const saved = await addClient(data);          // server row, or it threw
 *   result.succeed({ title: 'Cliente registrado', message: `${saved.name} ya está en tu directorio.` });
 *   ...
 *   <ActionResultDialog result={result.value} onClose={result.dismiss} />
 *
 * `fail` reads a thrown value directly, including the `fields` map that
 * `ClientWriteError` carries, so a caller does not re-implement that unwrapping
 * per surface — which is how four different error shapes reached the public
 * pages in #65.
 */
export function useActionResult() {
  const [value, setValue] = useState<ActionResult | null>(null);

  const succeed = useCallback(
    (r: Omit<ActionResult, 'outcome'>) => setValue({ ...r, outcome: 'success' }),
    []
  );

  const fail = useCallback(
    (error: unknown, fallback: Omit<ActionResult, 'outcome' | 'message'>) => {
      const message = error instanceof Error ? error.message : String(error || '');
      const fields =
        error && typeof error === 'object' && 'fields' in error
          ? ((error as { fields?: Record<string, string> }).fields ?? undefined)
          : undefined;
      setValue({
        ...fallback,
        outcome: 'error',
        message: message || 'No se pudo completar la acción. Vuelve a intentarlo.',
        // A single field message is already the `message`; listing it twice is noise.
        fields: fields && Object.keys(fields).length > 1 ? fields : undefined,
      });
    },
    []
  );

  const dismiss = useCallback(() => setValue(null), []);

  return { value, succeed, fail, dismiss };
}

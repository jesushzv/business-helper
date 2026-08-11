'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * The one modal shell for the whole app.
 *
 * Before this existed, every overlay was a bare `<div className="fixed inset-0 z-50 …">`:
 * no `role`, no Escape, no focus management (#100), and 6 of 9 panels had no
 * `max-h`/`overflow-y-auto`, so on a 375×667 phone with the keyboard open the
 * submit button sat off-screen with no way to reach it — including on the public
 * quote-signing page, mid-money-flow (#87). Both defects live in the same eight
 * files, and both are properties of *the shell*, not of any one form. So the
 * shell is a component and the call sites stop owning it.
 *
 * What this guarantees at every call site:
 *
 * - `role="dialog"` (or `alertdialog`) + `aria-modal` + an accessible name.
 * - Escape closes, and the backdrop closes unless the caller opts out.
 * - Focus moves into the panel on open, is trapped while it is open, and
 *   returns to the trigger on close.
 * - The panel is height-contained: it can never grow past the viewport with its
 *   contents unreachable.
 * - Exactly one close control, ≥48px (Don Roberto's touch-target floor), with a
 *   real accessible name — replacing four unlabeled icon buttons and two raw
 *   glyph buttons that drifted from the `lucide` icon everything else used.
 *
 * `tests/unit/modalShell.test.ts` fails the build if a new `fixed inset-0`
 * overlay appears outside this file, and `tests/components/Modal.test.tsx` pins
 * the behaviour above.
 */

type ModalVariant = 'center' | 'sheet';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The dialog's accessible name. Call sites keep their own visible heading —
   * this is what a screen reader announces when the dialog takes focus.
   */
  title: string;
  children: React.ReactNode;
  /** Panel width. Tailwind `max-w-*`; ignored for the `sheet` variant. */
  maxWidth?: string;
  /** `center` = phone/desktop dialog. `sheet` = bottom drawer (mobile menu). */
  variant?: ModalVariant;
  /**
   * Backdrop click dismisses. Default `true`. Set `false` where a stray tap
   * would discard typed work (long forms, the OTP flow mid-signature).
   */
  dismissOnBackdrop?: boolean;
  /** `alertdialog` for a message that interrupts; `dialog` otherwise. */
  role?: 'dialog' | 'alertdialog';
  /** Hide the built-in close button (a flow that must not be abandoned). */
  hideCloseButton?: boolean;
  /** Escapes the `z-50` default where a dialog must sit above another. */
  zIndexClassName?: string;
  /** Extra classes on the panel. */
  panelClassName?: string;
  /** Forwarded to the outermost node so tests can address a specific modal. */
  'data-testid'?: string;
}

/** Everything focusable a user can Tab to, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  variant = 'center',
  dismissOnBackdrop = true,
  role = 'dialog',
  hideCloseButton = false,
  zIndexClassName = 'z-50',
  panelClassName = '',
  'data-testid': testId,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Where focus was before we opened, so we can hand it back on close.
  const returnFocusRef = useRef<Element | null>(null);

  const focusable = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      // Attribute-based, deliberately: `offsetParent`/`getClientRects` are the
      // usual visibility test and both are always empty under jsdom, so a
      // layout-based filter drops *everything* in the tests while behaving
      // correctly in a browser — a difference the suite cannot see.
      (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true'
    );
  }, []);

  // Move focus into the panel on open; hand it back to the trigger on close.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    // The panel itself, not its first field: a screen reader announces the
    // dialog's name, and a phone does not throw up the keyboard for a form the
    // tenant may only have opened to read.
    panelRef.current?.focus();
    const previous = returnFocusRef.current;
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [open, focusable]);

  // Escape closes, and Tab cannot leave the panel while it is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusable]);

  // The page behind must not scroll under the dialog on a phone.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const isSheet = variant === 'sheet';

  return (
    <div
      data-testid={testId}
      className={
        isSheet
          ? `fixed inset-0 ${zIndexClassName} flex flex-col justify-end bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200`
          : `fixed inset-0 ${zIndexClassName} flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md`
      }
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={
          // `max-h` + `overflow-y-auto` is the whole of #87: without it a
          // vertically-centred panel overflows past *both* edges and the
          // content past them cannot be reached at any scroll position.
          isSheet
            ? `relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-slate-800 bg-slate-900 p-5 text-white shadow-2xl outline-none ${panelClassName}`
            : `relative my-8 max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl outline-none ${panelClassName}`
        }
      >
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Cerrar ${title}`}
            className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-800/90 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <X className="h-6 w-6" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;

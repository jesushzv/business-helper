/**
 * Line-item drafts — what the quote wizard's number fields hold while the owner
 * is still typing.
 *
 * The wizard used to bind `<input type="number">` straight to the numeric
 * `LineItem`, so an untouched concepto rendered a literal `0` in "Precio
 * Unitario ($)". A caret landing to the left of that zero — which is where a
 * tap on the left half of the field puts it — turned a typed `150` into
 * `1500`: a trailing zero with no visible source, on the field that decides
 * what the client is charged. `Number(e.target.value)` then wrote it straight
 * back, so it survived every keystroke that followed.
 *
 * A draft keeps the raw text instead. Numbers are derived once, here, and
 * nothing prefills a value the owner did not type: an untouched price is empty
 * and shows its placeholder.
 */

import type { LineItem } from '@/types';

export interface LineItemDraft {
  description: string;
  /** Raw text, not a number — '' means "not typed yet". */
  quantity: string;
  /** Raw text, not a number — '' means "not typed yet". */
  unit_price: string;
  sat_code: string;
  unit: string;
}

/** SAT clave for the first concepto (materiales de construcción). */
export const DEFAULT_SAT_CODE = '30111500';
/** SAT clave for conceptos added afterwards (servicios). */
export const ADDED_ITEM_SAT_CODE = '84111506';

export function createLineItemDraft(satCode: string = ADDED_ITEM_SAT_CODE): LineItemDraft {
  return {
    description: '',
    quantity: '1',
    // Empty, never '0': the zero is what the trailing-zero bug was made of.
    unit_price: '',
    sat_code: satCode,
    unit: 'E48',
  };
}

/**
 * Keeps a numeric field's text to what a MXN amount can look like, without
 * fighting the person typing it.
 *
 * Everything that is not a digit or a decimal point is dropped — in es-MX the
 * comma is the thousands separator, so `1,500.50` is $1,500.50 and not a
 * decimal — only the first point survives, and a redundant leading zero is
 * removed so `0150` reads back as `150`. A trailing `.` is preserved: it is a
 * half-typed decimal, and erasing it would delete the keystroke the owner just
 * made.
 */
export function normalizeNumericInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (cleaned === '') return '';

  const [integerPart, ...rest] = cleaned.split('.');
  const hasSeparator = rest.length > 0;
  const decimals = rest.join('');

  // '007' → '7', '000' → '0', '' (from '.5') → '0'
  const integer = integerPart.replace(/^0+(?=\d)/, '') || '0';

  return hasSeparator ? `${integer}.${decimals}` : integer;
}

/** The number a draft field stands for. Blank or half-typed reads as 0. */
export function parseNumericInput(raw: string): number {
  const parsed = Number.parseFloat(normalizeNumericInput(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Drafts → the `LineItem[]` the calculator and the API expect. */
export function toLineItems(drafts: LineItemDraft[]): LineItem[] {
  return drafts.map((draft) => ({
    description: draft.description.trim(),
    quantity: parseNumericInput(draft.quantity),
    unit_price: parseNumericInput(draft.unit_price),
    sat_code: draft.sat_code,
    unit: draft.unit,
  }));
}

export interface LineItemDraftValidation {
  valid: boolean;
  /** Spanish, safe to render as-is. `null` when everything is in order. */
  message: string | null;
}

/**
 * Why "Siguiente" will not advance. The step used to `return` silently on an
 * incomplete concepto, which reads as a dead button (#146's shape).
 */
export function validateLineItemDrafts(drafts: LineItemDraft[]): LineItemDraftValidation {
  const items = toLineItems(drafts);

  const missingDescription = items.findIndex((item) => !item.description);
  if (missingDescription !== -1) {
    return {
      valid: false,
      message: `Escribe la descripción del concepto #${missingDescription + 1}.`,
    };
  }

  const missingQuantity = items.findIndex((item) => item.quantity <= 0);
  if (missingQuantity !== -1) {
    return {
      valid: false,
      message: `La cantidad del concepto #${missingQuantity + 1} debe ser mayor a cero.`,
    };
  }

  const missingPrice = items.findIndex((item) => item.unit_price <= 0);
  if (missingPrice !== -1) {
    return {
      valid: false,
      message: `Escribe el precio unitario del concepto #${missingPrice + 1}.`,
    };
  }

  return { valid: true, message: null };
}

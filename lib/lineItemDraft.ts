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
 * The numeric-text rule now lives in `lib/numericInput.ts`, because four other
 * surfaces needed it (#151) and a shared rule about money inputs does not
 * belong inside the line-item module. Re-exported here so the wizard's existing
 * imports keep reading as they did.
 */
import { normalizeNumericInput, parseNumericInput } from './numericInput';

export { normalizeNumericInput, parseNumericInput };

/**
 * `LineItem[]` → drafts, for editing a quote that already exists (#340).
 *
 * The inverse of {@link toLineItems}, and it has to be: a quote round-tripped
 * through the editor without a change must come back byte-identical, or an
 * owner who opened the form to fix a typo silently rewrites the figures their
 * client was shown.
 *
 * Numbers become their own text — `String(5)` is `'5'`, not `'5.00'` — because
 * the drafts hold what the owner typed, and re-inserting trailing zeros is the
 * defect `normalizeNumericInput` exists to prevent. An empty list yields one
 * blank draft rather than none, so the form always has a row to type into.
 */
export function toLineItemDrafts(items: LineItem[] | null | undefined): LineItemDraft[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [createLineItemDraft(DEFAULT_SAT_CODE)];
  }

  return items.map((item, index) => ({
    description: String(item?.description ?? ''),
    quantity: Number.isFinite(Number(item?.quantity)) ? String(Number(item.quantity)) : '',
    unit_price: Number.isFinite(Number(item?.unit_price)) ? String(Number(item.unit_price)) : '',
    sat_code: String(item?.sat_code || (index === 0 ? DEFAULT_SAT_CODE : ADDED_ITEM_SAT_CODE)),
    unit: String(item?.unit || 'E48'),
  }));
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

/**
 * What a number field holds while someone is typing into it (#151).
 *
 * Two habits produced the same family of defects on every money input in the
 * app, and they compound:
 *
 * 1. **A numeric model behind the field.** `value={amount}` where `amount` is a
 *    number renders `0` for "untouched", so a caret landing left of it turns
 *    `150` into `1500`; and `onChange={e => setAmount(Number(e.target.value))}`
 *    round-trips every keystroke, so `1500.` — a half-typed decimal — reads back
 *    as `1500` and the point the owner just pressed disappears.
 * 2. **`type="number"`.** Chrome's value getter returns `''` for a
 *    partially-valid number, so the field *blanks itself* mid-decimal; a pasted
 *    `$1,500.50` is rejected wholesale rather than cleaned; and the spinner is
 *    a 12px hit target on the 375px viewport this product is designed for.
 *
 * The shape that works, and what every numeric field here now uses: hold the
 * raw **text**, normalize it on change, and render `type="text"
 * inputMode="decimal"` so the browser offers the numeric keypad and then keeps
 * its hands off the value. Parse to a number only at the point of use.
 *
 * These two functions started life in `lib/lineItemDraft.ts` for the quote
 * wizard, which is where the defect was first fixed. They moved here when the
 * SPEI confirm modal, `/pay`, the product catalog and the client credit limit
 * needed them too — a shared rule about money inputs does not belong inside the
 * line-item module (#151 asked for exactly this rename).
 */

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

/**
 * The same rule for a field that counts things rather than measuring them.
 *
 * Existencias is a count of units in stock: `2.5` piezas is not a quantity the
 * catalog can hold, and a decimal point typed into it is a slip, not an intent.
 * Digits only, with the same leading-zero collapse — an empty string stays
 * empty, because "no lo llevo en inventario" and "tengo cero" are different
 * answers and the column is nullable precisely so they can stay different.
 */
export function normalizeIntegerInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return digits.replace(/^0+(?=\d)/, '') || '0';
}

/**
 * A stored number, as the text a field should show for it.
 *
 * `null`/`undefined` render as the empty string rather than `0`: an amount
 * nobody has set and an amount someone set to zero are different facts, and
 * this is the seam where collapsing them would put a `0` under the caret.
 */
export function numericInputValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

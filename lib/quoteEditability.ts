/**
 * May this quote's *content* still be changed, and what does changing it cost?
 *
 * Until now a quote's line items and total were immutable from the product:
 * the only mutation any screen issued was `updateQuoteStatus`, which sends
 * `{ status }` alone. Raising a total was reachable from the API and from
 * nothing a tenant could tap (#340). The founder decided a quote should be
 * editable after creation, and this module is the boundary that decision needs.
 *
 * **Draft and sent, nothing else** (founder, 2026-08-15):
 *
 *   - `draft` — nobody outside the organization has seen it.
 *   - `sent` — a `/q/` link is live in a client's hands, so editing it **sends
 *     the quote back to `draft`**. That is not a side effect to be tidied away
 *     later: it is what stops a client reading a document that changed under
 *     them, and it forces the owner to re-send, which is the moment the client
 *     learns the figures moved. `quoteSignableState` already answers
 *     `not_yet_sent` for a draft, and `QUOTE_REFUSAL` already says
 *     *"Esta cotización todavía no está lista para firma. Pídele al negocio que
 *     te la envíe."* — so the link retires itself with a message that was
 *     already right, and no token has to be rotated.
 *   - `accepted` / `converted` — carry the client's OTP signature. #327/#335
 *     made that evidence immutable on purpose; editing the document behind a
 *     signature is the one thing this feature must never allow.
 *   - `rejected` / `expired` — refused too, and this is the deliberate cost of
 *     the boundary chosen: fixing and re-sending an expired quote means making
 *     a new one. Worth revisiting if a tenant asks; the refusal names it rather
 *     than failing silently.
 *
 * A **status-only** edit is not a content edit and is untouched by any of this
 * — that is `updateQuoteStatus`, the path that marks a quote sent, accepted or
 * rejected, and gating it here would break the pipeline this feature is not
 * about.
 */

/**
 * The writable fields that constitute the *document* rather than its state.
 *
 * Derived from `QUOTE_WRITABLE_FIELDS` minus `status`: everything a client
 * would see change on the shared link. Stated here rather than inline at the
 * route so the two cannot drift — a field added to the quote and forgotten
 * here would be editable on a signed quote, which is the whole risk.
 */
export const QUOTE_CONTENT_FIELDS = [
  'title',
  'client_id',
  'line_items',
  'subtotal_amount',
  'iva_amount',
  'retencion_isr_amount',
  'retencion_iva_amount',
  'total_amount',
  'currency',
  'valid_until',
  'notes',
  'bank_account_id',
] as const;

/** Does this update touch the document, or only its state? */
export function touchesQuoteContent(updates: Record<string, unknown>): boolean {
  return (QUOTE_CONTENT_FIELDS as readonly string[]).some((field) => field in updates);
}

export type QuoteEditVerdict =
  /** Editable as-is; `resetToDraft` says whether the link must retire with it. */
  | { ok: true; resetToDraft: boolean }
  | { ok: false; code: string; message: string; status: number };

/**
 * What a content edit of a quote in this status earns.
 *
 * Every refusal is Mexican Spanish, names the reason in the owner's terms and
 * says what to do instead — a wall with a code on it is the #146 shape, and
 * this one lands on someone who has just typed a change they expected to keep.
 */
export function quoteContentEditVerdict(status?: string | null): QuoteEditVerdict {
  switch (status || 'draft') {
    case 'draft':
      return { ok: true, resetToDraft: false };

    case 'sent':
      // Allowed, and the link retires. The route is responsible for actually
      // writing `status: 'draft'`; saying so here keeps the decision in one
      // place and lets a test assert it without going through PostgREST.
      return { ok: true, resetToDraft: true };

    case 'accepted':
    case 'converted':
      return {
        ok: false,
        code: 'QUOTE_SIGNED_IMMUTABLE',
        message:
          'Esta cotización ya fue firmada por tu cliente, así que no se puede modificar. ' +
          'Su firma es la evidencia legal del documento tal como lo aceptaron. ' +
          'Crea una cotización nueva si necesitas cambiar los montos.',
        status: 409,
      };

    case 'rejected':
      return {
        ok: false,
        code: 'QUOTE_NOT_EDITABLE',
        message:
          'Esta cotización fue rechazada, así que ya no se puede modificar. ' +
          'Crea una nueva si quieres volver a cotizarle a este cliente.',
        status: 409,
      };

    case 'expired':
      return {
        ok: false,
        code: 'QUOTE_NOT_EDITABLE',
        message:
          'Esta cotización ya venció, así que ya no se puede modificar. ' +
          'Crea una nueva con las fechas y los precios de hoy.',
        status: 409,
      };

    default:
      // An unrecognised status is refused rather than mapped to the nearest
      // one that happens to be editable (#95): the vocabulary can only widen
      // through a migration, and guessing here would be guessing about whether
      // a client has signed.
      return {
        ok: false,
        code: 'QUOTE_NOT_EDITABLE',
        message:
          'No se puede modificar esta cotización en su estado actual. ' +
          'Crea una nueva si necesitas cambiar los montos.',
        status: 409,
      };
  }
}

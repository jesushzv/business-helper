/**
 * Business Helper — is this quote still signable?
 *
 * One predicate, three consumers: the public GET (which decides what `/q/`
 * renders), the OTP-issuing route, and the signing route. They disagreed twice
 * over before this existed.
 *
 * **Expiry was enforced nowhere** (#258). `valid_until` was written by the
 * wizard and displayed on two screens, and nothing ever compared it to today or
 * wrote `status = 'expired'` — so a quote priced in July could be OTP-signed in
 * September, minting a seal the page calls "evidencia legal certificada" and
 * carrying `client_signed` onto the contract. `QuoteStatusBadge`'s "Vencida"
 * arm was unreachable code and the public page's own "o enlace expirado" copy
 * promised a control that did not exist.
 *
 * **Status was read by the routes and ignored by the page** (#282). Both public
 * routes fail closed on `status ∉ {sent, accepted}`, but the page's only branch
 * was "sealed or sign button", so a converted, rejected or draft quote showed a
 * live "Aceptar y Firmar" that dead-ended at OTP time with no explanation.
 */

import { productTodayStr } from './dates';

/** The states a quote's public link may be in, from the signer's point of view. */
export type QuoteSignableState =
  | 'signable'
  | 'already_signed'
  | 'expired'
  | 'converted'
  | 'rejected'
  | 'not_yet_sent';

/** The statuses the signing and OTP routes accept. */
const SIGNABLE_QUOTE_STATUSES = ['sent', 'accepted'] as const;

export interface SignabilityInput {
  status?: string | null;
  valid_until?: string | null;
  /** The seal, when one exists — its presence means the quote was signed. */
  contract_hash?: string | null;
  /** The server-side flag the signing routes key on. */
  client_otp_verified?: boolean | null;
}

/** Today as a `YYYY-MM-DD` string, matching the `date` column's shape. */
function todayDateString(): string {
  return productTodayStr();
}

/**
 * Has this quote's validity window closed?
 *
 * Date-only comparison, and **strictly before**: a quote reading "Válida hasta:
 * 2026-08-01" is still signable throughout 2026-08-01 and expired on the 2nd.
 * Anything unparseable or absent is treated as *no* expiry — an open-ended
 * quote is the pre-existing behaviour, and inventing an expiry the tenant never
 * set would block a signature they want.
 *
 * The reference date is the **product's** day (`America/Mexico_City`), not the
 * server's UTC one: from 18:00 in Mexico, UTC has already turned over, and a
 * quote valid "hasta hoy" was refused for the whole evening of the day it was
 * still good for. `todayStr` stays injectable for callers that have already
 * resolved the day — but it is never taken from the request, because expiry is
 * enforcement and a client-supplied day is a client-chosen deadline (#334).
 */
export function isQuoteExpired(validUntil?: string | null, todayStr?: string): boolean {
  if (!validUntil) return false;
  const validDate = String(validUntil).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validDate)) return false;
  return validDate < (todayStr || todayDateString());
}

/**
 * What the signer may do with this quote right now.
 *
 * Order matters: a signed quote reads as signed even after its validity window
 * closes — the signature already happened, and telling the client their signed
 * proposal "expired" would be false.
 */
export function quoteSignableState(
  quote: SignabilityInput,
  todayStr?: string
): QuoteSignableState {
  if (quote?.client_otp_verified || quote?.contract_hash) return 'already_signed';

  const status = quote?.status || 'draft';

  if (status === 'converted') return 'converted';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  if (!(SIGNABLE_QUOTE_STATUSES as readonly string[]).includes(status)) return 'not_yet_sent';

  if (isQuoteExpired(quote?.valid_until, todayStr)) return 'expired';

  return 'signable';
}

/**
 * The refusal each non-signable state earns from a public route.
 *
 * Spanish and safe to render verbatim, per the `publicApiError` contract (#65):
 * the client reading it is not the tenant and cannot be sent to a dashboard.
 * Each one names what to do next, because a wall mid-flow on a link the tenant
 * sent is worse than no link at all.
 */
export const QUOTE_REFUSAL: Record<
  Exclude<QuoteSignableState, 'signable'>,
  { code: string; message: string }
> = {
  already_signed: {
    code: 'QUOTE_ALREADY_SIGNED',
    message: 'Esta cotización ya fue firmada.',
  },
  expired: {
    code: 'QUOTE_EXPIRED',
    message:
      'Esta cotización ya venció. Pídele al negocio una cotización actualizada para poder firmarla.',
  },
  converted: {
    code: 'QUOTE_NOT_SIGNABLE',
    message: 'Esta cotización ya se convirtió en contrato; no hace falta firmarla de nuevo.',
  },
  rejected: {
    code: 'QUOTE_NOT_SIGNABLE',
    message: 'Esta cotización fue rechazada. Pídele al negocio una nueva si quieres continuar.',
  },
  not_yet_sent: {
    code: 'QUOTE_NOT_SIGNABLE',
    message: 'Esta cotización todavía no está lista para firma. Pídele al negocio que te la envíe.',
  },
};

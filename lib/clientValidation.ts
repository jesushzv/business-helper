import { validateCreditTerms } from '@/lib/apiAuth';
import { normalizeClientPhone } from '@/lib/phoneValidator';

/**
 * Validation for a client write, reported **per field and all at once**.
 *
 * Both clients routes used to validate in sequence and return on the first
 * failure: name, then RFC, then credit terms, then phone. A tenant whose form
 * had two problems therefore fixed one, resubmitted, and was told about the
 * next — and because the response carried only a prose `message`, nothing on
 * screen ever said *which* input was wrong. Registering a client turned into a
 * guessing game against a banner at the top of a modal the phone had already
 * scrolled past.
 *
 * So the contract here is: check everything, attribute every failure to the
 * column it came from, and let the caller render each message next to its own
 * input. `fieldErrors` is keyed by column name, which is also the key the form
 * submits, so the UI needs no translation table.
 *
 * **The RFC is deliberately absent from the failure paths.** It is optional at
 * registration and is not validated here at all — see {@link normalizeRfc}.
 */

export interface ClientWriteValidation {
  /** Column name → Spanish message. Empty when the write may proceed. */
  fieldErrors: Record<string, string>;
  /** Normalized values to merge into the insert/update. */
  values: Record<string, unknown>;
}

export interface ClientWriteOptions {
  /**
   * True on create, where a nameless client is meaningless. On update an
   * unusable name is *ignored* rather than rejected: a caller patching only
   * `notes` must not be forced to resend the name, and a `{"name": null}` body
   * must leave the stored name alone rather than rename the client to "null".
   */
  requireName: boolean;
}

/**
 * Every column this module can attribute a failure to, in the order a person
 * reads the form.
 *
 * Exported because the form has to have an input to point at for each one:
 * `tests/components/ClientFormModal.test.tsx` walks this list against
 * `FIELD_INPUT_IDS` and the rendered DOM, so a new validated column cannot ship
 * with its message stranded in a banner nobody scrolls to.
 */
export const FIELD_ORDER = [
  'name',
  'email',
  'phone',
  'codigo_postal',
  'credit_limit',
  'credit_days',
  'credit_status',
] as const;

/** The machine code for the envelope, chosen from the highest-priority failure. */
const FIELD_ERROR_CODES: Record<string, string> = {
  name: 'INVALID_INPUT',
  email: 'INVALID_INPUT',
  codigo_postal: 'INVALID_INPUT',
  phone: 'INVALID_PHONE',
  credit_limit: 'INVALID_CREDIT_TERMS',
  credit_days: 'INVALID_CREDIT_TERMS',
  credit_status: 'INVALID_CREDIT_TERMS',
};

/** Field name as it appears in the summary line, matching the form's labels. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre o Razón Social',
  email: 'Correo Electrónico',
  phone: 'Teléfono WhatsApp',
  codigo_postal: 'Código Postal',
  credit_limit: 'Límite de Crédito',
  credit_days: 'Plazo de Crédito',
  credit_status: 'Estatus de Crédito',
};

const CREDIT_FIELDS = ['credit_limit', 'credit_days', 'credit_status'] as const;

/**
 * Deliberately forgiving: "something@something.something".
 *
 * A strict RFC 5322 pattern rejects addresses that deliver perfectly well, and
 * this check is not the authority on anything — the address is only ever used
 * to send mail, which fails loudly on its own. Same asymmetry the phone field
 * documents: a client-side gate stricter than reality blocks a value the
 * product could actually use, which is the worse direction to be wrong in.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mexican postal codes are exactly five digits; the CFDI receptor block needs one. */
const CODIGO_POSTAL_SHAPE = /^\d{5}$/;

/**
 * Normalizes an RFC without judging it.
 *
 * The RFC used to block the write on both routes: anything that did not match
 * the SAT pattern returned a 400 and the client could not be registered at all.
 * That gate was in the wrong place. A client record is a *directory entry* —
 * a name and a way to reach someone — and an owner adding one from a phone
 * often has the RFC on a card they have not been handed yet, or has a foreign
 * client who will never have one. Refusing the whole record over it stops the
 * work the product exists to do.
 *
 * Nothing is fabricated by accepting it: the RFC is validated where it is
 * actually load-bearing, in `lib/facturapi.ts`, which refuses to stamp a CFDI
 * whose receptor RFC does not match `RFC_PATTERN` and says so. The form warns
 * next to the field, so a malformed value is visible at entry rather than
 * silently blessed — it is simply not a reason to lose the client.
 */
export function normalizeRfc(rfc: unknown): string | null {
  if (rfc === undefined || rfc === null) return null;
  const cleaned = String(rfc).toUpperCase().trim();
  return cleaned || null;
}

/**
 * Builds the summary line shown above the form when several fields are wrong.
 *
 * One failure reads as itself; several are counted and named, because "Revisa
 * 2 campos" alone sends the tenant hunting through a form they cannot see all
 * of at once.
 */
export function summarizeFieldErrors(fieldErrors: Record<string, string>): string {
  const keys = FIELD_ORDER.filter((f) => fieldErrors[f]);
  const extra = Object.keys(fieldErrors).filter((f) => !FIELD_ORDER.includes(f as never));
  const ordered = [...keys, ...extra];

  if (ordered.length === 0) return '';
  if (ordered.length === 1) return fieldErrors[ordered[0]];

  const labels = ordered.map((f) => FIELD_LABELS[f] || f);
  const last = labels.pop();
  return `Revisa ${ordered.length} campos: ${labels.join(', ')} y ${last}.`;
}

/** The envelope `code` for a set of failures — the first one a person would fix. */
export function fieldErrorCode(fieldErrors: Record<string, string>): string {
  const first = FIELD_ORDER.find((f) => fieldErrors[f]);
  return (first && FIELD_ERROR_CODES[first]) || 'INVALID_INPUT';
}

export function validateClientWrite(
  fields: Record<string, unknown>,
  { requireName }: ClientWriteOptions
): ClientWriteValidation {
  const fieldErrors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  // --- Name -----------------------------------------------------------------
  const name = fields.name;
  const usableName = typeof name === 'string' && name.trim() ? name.trim() : null;
  if (usableName) {
    values.name = usableName;
  } else if (requireName) {
    fieldErrors.name = 'Escribe el nombre o razón social del cliente.';
  }

  // --- Email ----------------------------------------------------------------
  if ('email' in fields) {
    const raw = fields.email;
    if (raw === null || (typeof raw === 'string' && !raw.trim())) {
      values.email = null;
    } else if (typeof raw !== 'string' || !EMAIL_SHAPE.test(raw.trim())) {
      fieldErrors.email = 'El correo debe tener la forma nombre@dominio.com, o déjalo vacío.';
    } else {
      values.email = raw.trim();
    }
  }

  // --- Código postal --------------------------------------------------------
  if ('codigo_postal' in fields) {
    const raw = fields.codigo_postal;
    if (raw === null || (typeof raw === 'string' && !raw.trim())) {
      values.codigo_postal = null;
    } else if (typeof raw !== 'string' || !CODIGO_POSTAL_SHAPE.test(raw.trim())) {
      fieldErrors.codigo_postal = 'El código postal son 5 dígitos (ej. 64000), o déjalo vacío.';
    } else {
      values.codigo_postal = raw.trim();
    }
  }

  // --- Phone ----------------------------------------------------------------
  // Only when the caller is actually setting it: a patch of `notes` must not
  // fail over a value already sitting in the column (#40).
  if ('phone' in fields) {
    const normalized = normalizeClientPhone(fields.phone);
    if (normalized.error) fieldErrors.phone = normalized.error;
    else values.phone = normalized.value;
  }

  // --- RFC ------------------------------------------------------------------
  // Never a failure. See normalizeRfc.
  if ('rfc' in fields) values.rfc = normalizeRfc(fields.rfc);

  // --- Trade credit ---------------------------------------------------------
  // `validateCreditTerms` reports one message for the whole group, so it is
  // asked about one column at a time; that is what turns "El plazo de pago debe
  // ser un número de días" into a message the UI can pin under the plazo input.
  for (const key of CREDIT_FIELDS) {
    if (!(key in fields)) continue;
    const result = validateCreditTerms({ [key]: fields[key] });
    if (!result.ok) fieldErrors[key] = result.message;
    else Object.assign(values, result.values);
  }

  return { fieldErrors, values };
}

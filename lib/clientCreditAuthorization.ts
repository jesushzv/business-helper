import { hasCapability, type UserRole } from './teamRBAC';

/**
 * Who may set a client's trade-credit line (#123).
 *
 * The three credit columns are not ordinary contact details. `credit_limit`
 * decides how much unsecured credit the business extends, and `credit_status`
 * is how an owner cuts off a client who has stopped paying. Until #96 made
 * these columns persist they were silently discarded for everyone, so nobody
 * had to decide; once they persisted, any `member` — whose capabilities are
 * `create_quote`, `edit_quote`, `request_payment` — could raise a defaulting
 * client's limit or clear the block the owner had just set, and the quote
 * wizard would stop warning.
 *
 * The decision (#123, option 2) is that credit is a **control**, not a note:
 * owners and managers set it, members keep full client CRUD without it.
 *
 * ## Why this is not a silent strip
 *
 * The obvious implementation — drop the three keys from a member's write and
 * carry on — is hard rule #1 in a new costume: the modal closes reporting the
 * client saved while the limit the tenant typed went nowhere. So a write that
 * would *change* a credit value is refused with a 403 that names each field,
 * and the form disables the section for anyone who cannot use it (#64's
 * corollary: never send a user to a control whose write they lack).
 *
 * A write that repeats the values already stored changes nothing, and the form
 * sends the whole record on every edit — so a member fixing a phone number
 * must not be refused over the credit values it echoes back unchanged. Those
 * keys are dropped, because dropping a no-op reports nothing untrue.
 */

export const CLIENT_CREDIT_FIELDS = ['credit_limit', 'credit_days', 'credit_status'] as const;

export type ClientCreditField = (typeof CLIENT_CREDIT_FIELDS)[number];

/** The credit columns as stored, or null when the client does not exist yet. */
export type StoredCredit = Partial<Record<ClientCreditField, unknown>> | null;

export type CreditWriteAuthorization =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; message: string; fields: Record<ClientCreditField, string> | Record<string, string> };

const FIELD_LABELS: Record<ClientCreditField, string> = {
  credit_limit: 'el límite de crédito',
  credit_days: 'el plazo de crédito',
  credit_status: 'el estatus de crédito',
};

/**
 * Compares an incoming value with the stored one the way the column would.
 *
 * `credit_limit` comes back from `numeric(12,2)` as `'50000.00'` while the form
 * sends `50000`; comparing those with `!==` would refuse every member edit as
 * an attempted change. Blank, null and undefined all mean "no credit line" and
 * must compare equal to a NULL column, or clearing nothing would read as
 * clearing something.
 */
function sameValue(field: ClientCreditField, incoming: unknown, stored: unknown): boolean {
  const norm = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string' && !raw.trim()) return null;
    if (field === 'credit_status') return String(raw).trim();
    const n = Number(raw);
    // A non-numeric limit is a validation problem, not an authorization one;
    // fall back to the literal text so it still compares consistently here and
    // is refused with a 400 downstream.
    return Number.isFinite(n) ? String(n) : String(raw).trim();
  };
  return norm(incoming) === norm(stored);
}

/**
 * Decides whether this caller's write may touch the credit columns.
 *
 * Returns the fields to carry forward: unchanged for a caller with the
 * capability, and with no-op credit keys removed for one without it. `stored`
 * is null on create, where any credit value at all is a change.
 */
export function authorizeCreditWrite(
  fields: Record<string, unknown>,
  role: UserRole | string,
  stored: StoredCredit
): CreditWriteAuthorization {
  if (hasCapability(role, 'manage_credit')) return { ok: true, fields };

  const attempted = CLIENT_CREDIT_FIELDS.filter(
    (field) => field in fields && !sameValue(field, fields[field], stored?.[field] ?? null)
  );

  if (attempted.length === 0) {
    // Nothing would change. Drop the keys rather than refuse an edit the tenant
    // did not make — and rather than write them, which is not this caller's to do.
    const next = { ...fields };
    for (const field of CLIENT_CREDIT_FIELDS) delete next[field];
    return { ok: true, fields: next };
  }

  const fieldErrors: Record<string, string> = {};
  for (const field of attempted) {
    fieldErrors[field] = `Tu rol no permite cambiar ${FIELD_LABELS[field]}. Pídeselo al dueño o a un administrador de la cuenta.`;
  }

  return {
    ok: false,
    message:
      attempted.length === 1
        ? `Tu rol no permite cambiar ${FIELD_LABELS[attempted[0]]}. Los demás datos del cliente sí puedes editarlos.`
        : 'Tu rol no permite cambiar las condiciones de crédito. Los demás datos del cliente sí puedes editarlos.',
    fields: fieldErrors,
  };
}

/** True when this role may set credit terms — the form asks this too. */
export function canManageCredit(role: UserRole | string | null | undefined): boolean {
  if (!role) return false;
  return hasCapability(role, 'manage_credit');
}

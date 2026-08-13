/**
 * Shared pieces of the public payment surface (`/api/receivables/public/*`).
 *
 * Both the declaration route and the receipt-upload route resolve "which
 * milestone is this payer paying" from the same quote `public_token`, and the
 * two answers must agree — the #79/#65 fix pinned GET and POST to one
 * predicate, and the upload endpoint (#85) joins it here rather than growing
 * a third copy.
 */

export interface PublicMilestone {
  id: string;
  label?: string;
  amount?: number;
  due_date?: string;
  status?: string;
}

/**
 * The payer-facing target: the earliest milestone still awaiting payment.
 *
 * GET and POST must agree on this predicate. Both used to take `[0]` of an
 * unordered embed, so on a two-milestone contract the row shown and the row
 * marked could differ — and a re-POST could rewrite a `confirmed` milestone
 * back to `marked_paid`, overwriting the confirmed record's evidence. The
 * defect was unreachable while #79 404'd every request; fixing #79 made it
 * live, so both are fixed together.
 */
export function pickPayableMilestone(milestones: PublicMilestone[]): PublicMilestone | null {
  const payable = milestones
    .filter((m) => m.status === 'pending' || m.status === 'requested')
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  return payable[0] ?? null;
}

/** The bucket every SPEI receipt lands in, public read (the vendor's Cobranza links point straight at it). */
export const SPEI_VOUCHERS_BUCKET = 'spei-vouchers';

/**
 * Builds the storage object path for a receipt uploaded through the public
 * portal. Namespaced by organization and keyed to the milestone the token
 * resolves to, so a path can later be checked against both.
 */
export function buildReceiptPath(
  organizationId: string,
  milestoneId: string,
  extension: string,
  now: number
): string {
  return `${organizationId}/spei_${milestoneId}_${now}.${extension}`;
}

/**
 * True only for a path this app's upload route could have issued for exactly
 * this organization and milestone.
 *
 * The declaration route accepts a `receipt_path` from the (unauthenticated)
 * payer and turns it into the URL the vendor's Cobranza renders — so the
 * value is constrained to the shape `buildReceiptPath` produces, under the
 * org and milestone the token itself resolves to. Anything else — a `blob:`
 * URL (#85), another tenant's path, an arbitrary storage object — is
 * refused, never stored.
 */
export function isValidReceiptPath(
  path: unknown,
  organizationId: string,
  milestoneId: string
): path is string {
  if (typeof path !== 'string') return false;
  const pattern = new RegExp(
    `^${escapeRegExp(organizationId)}/spei_${escapeRegExp(milestoneId)}_\\d{1,16}\\.[a-z0-9]{1,8}$`
  );
  return pattern.test(path);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

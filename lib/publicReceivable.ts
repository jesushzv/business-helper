/**
 * Shared pieces of the public payment surface (`/api/receivables/public/*`).
 *
 * Both the declaration route and the receipt-upload route resolve "which
 * milestone is this payer paying" from the same quote `public_token`, and the
 * two answers must agree — the #79/#65 fix pinned GET and POST to one
 * predicate, and the upload endpoint (#85) joins it here rather than growing
 * a third copy.
 */

import { recordedTransferAmount, remainingToRecord } from './receivablesCalculator';

export interface PublicMilestone {
  id: string;
  label?: string;
  amount?: number;
  due_date?: string;
  status?: string;
}

/**
 * What {@link pickPayableMilestone} needs every caller to have selected.
 *
 * `transferred_amount` is required and nullable, matching `CollectedBase`: the
 * predicate now asks whether a balance remains, and a row whose query never
 * took the column would answer "nothing remains" for a cobro nobody has paid.
 * Declaring it here makes tsc refuse the select that drops it, which the
 * all-optional `PublicMilestone` cannot do — the #78 shape, on the query that
 * decides whether a payer can pay at all.
 */
export interface PayableCandidate extends PublicMilestone {
  amount?: number;
  transferred_amount: number | string | null;
  cfdi_total?: number | string | null;
  cfdi_status?: string | null;
}

/**
 * Statuses a payer may still transfer against.
 *
 * `confirmed` is **not** here, and its absence is the one part of #382 this
 * change does not fix. A confirmed cobro that came up short still owes money,
 * but crediting a new declaration against it would either book the payer's
 * unconfirmed claim as revenue (`collectedAmount` reads the milestone status)
 * or, by moving the status back, erase the confirmed part from every KPI. The
 * third option — confirmation attached to a ledger row rather than to the
 * milestone — is a change to the function every aging bucket depends on and is
 * tracked separately. The owner is not stuck meanwhile: **Registrar pago**
 * (#394) records the remainder from Cobranza.
 */
const PAYABLE_STATUSES = new Set(['pending', 'requested', 'marked_paid']);

/**
 * Why there is nothing for this payer to do.
 *
 * `settled` — the business has recorded everything this cobro is owed. Do not
 * transfer again.
 * `recorded` — nothing is open: every milestone is confirmed, or declared and
 * beyond what this link may credit.
 */
export type NoPayableReason = 'settled' | 'recorded';

export interface PayableSelection<T> {
  milestone: T | null;
  /** Populated only when `milestone` is null, so the caller's 409 says which. */
  reason: NoPayableReason | null;
}

/**
 * The payer-facing target: the earliest milestone that still owes money.
 *
 * Deliberately generic in the row type (#371): each of the three callers
 * selects a different set of columns beyond the ones required here, and a
 * signature returning the base `PayableCandidate` would erase whatever the
 * caller actually read, forcing a cast at exactly the seam where dropping a
 * money column is the defect.
 *
 * GET, POST and the receipt upload must agree on this predicate. All three used
 * to take `[0]` of an unordered embed, so on a two-milestone contract the row
 * shown and the row marked could differ — and a re-POST could rewrite a
 * `confirmed` milestone back to `marked_paid`, overwriting the confirmed
 * record's evidence. The defect was unreachable while #79 404'd every request;
 * fixing #79 made it live, so both were fixed together.
 *
 * **The question is the balance, not the status alone** (#382). Filtering to
 * `pending`/`requested` meant a client who wired $20,000 of a $48,720 cobro and
 * declared it lost the link forever: the row went `marked_paid`, the product
 * went on showing $28,720 owed in Cobranza, and the only route to paying it was
 * off-app. Paying in two goes is not an edge case for an anticipo of that size.
 *
 * `marked_paid` therefore stays payable while a balance remains, and the
 * declaration appends a second ledger row rather than replacing the first
 * (#381). Nothing can be un-confirmed by this: `confirmed` is excluded here and
 * in `record_milestone_payment`'s own filter, which repeats the predicate
 * inside the write so a replay cannot move a row backwards.
 *
 * The `reason` distinguishes the two ways of returning nothing, because they
 * are different things to tell a payer: "ya está cubierto — no transfieras de
 * nuevo" is not "ya fue registrado".
 */
export function pickPayableMilestone<T extends PayableCandidate>(
  milestones: T[]
): PayableSelection<T> {
  const open = (milestones ?? [])
    .filter((m) => PAYABLE_STATUSES.has(String(m?.status ?? '')))
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));

  const payable = open.find((m) => !isCovered(m));
  if (payable) return { milestone: payable, reason: null };

  // Something is open, and everything recorded against it covers what it owes.
  // Rendering payment instructions here asks for a sum that has already
  // arrived — the duplicate-transfer harm, so it gets its own refusal rather
  // than a $0 payment request.
  if (open.length > 0) return { milestone: null, reason: 'settled' };

  return { milestone: null, reason: 'recorded' };
}

/**
 * Everything this cobro is owed has been recorded as received.
 *
 * The `recordedTransferAmount(m) > 0` half is not redundant with the balance.
 * A milestone whose settlement figure is **zero** — no amount, no stamped
 * total — has a zero balance without a peso ever having arrived, and answering
 * "ya está cubierto, no transfieras de nuevo" there is a claim about payments
 * that never happened. Nothing arrived, so nothing is covered: it stays
 * payable and the page shows what the row actually says.
 */
function isCovered(milestone: PayableCandidate): boolean {
  return recordedTransferAmount(milestone) > 0 && remainingToRecord(milestone) <= 0;
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

/**
 * Business Helper — Receivables Aging & Summary Calculator
 */

import { localTodayStr } from './dates';

export interface MilestoneItem {
  id: string;
  contract_id?: string;
  organization_id?: string;
  label: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'requested' | 'marked_paid' | 'confirmed' | string;
  receipt_url?: string | null;
  tracking_reference?: string | null;
  /**
   * What the owner confirmed actually arrived. **Required, and nullable** — the
   * two states mean different things and the difference is money (#351).
   *
   * `null` is a real answer: a row confirmed before the column carried a figure
   * recorded "the full amount arrived". A *missing key* is not an answer at
   * all — it means the caller never selected the column — and
   * {@link collectedAmount} used to read the two identically, so every
   * confirmed milestone in a select that forgot the column booked as fully
   * collected. Declaring it required makes tsc refuse the mapping that drops
   * it; `tests/unit/milestoneMoneySelects.test.ts` catches the PostgREST
   * selects tsc cannot see through their `any` casts.
   */
  transferred_amount: number | string | null;
  confirmed_at?: string | null;
  created_at?: string;
  /**
   * The PAC's own total for the stamped document (#341).
   *
   * The column has existed and `/api/receivables` has been returning it — `*`
   * covers it — but no interface between the route and the UI declared it, so
   * every consumer read `amount` and the value was dropped at the type
   * boundary. That is the #78 shape: a field that arrives, is never mapped,
   * and cannot be missed because nothing said it should be there.
   *
   * NULL for anything stamped before the column was recorded, and for
   * everything never stamped at all. {@link expectedSettlementAmount} owns the
   * fallback — read that, not this.
   */
  cfdi_total?: number | string | null;
  /** Stamping state of the milestone's CFDI. A cancelled document settles nothing. */
  cfdi_status?: string | null;
}

/**
 * The three fields that decide what a cobro has to be paid to be settled.
 *
 * Stated as its own type rather than `Pick<MilestoneItem, …>` because the
 * server-side caller (`ComplementMilestoneState` in lib/complementoPago.ts)
 * reads the same columns straight off PostgREST, where a `numeric` arrives as
 * a string and `amount` may be absent — the UI's `MilestoneItem` has already
 * narrowed `amount` to a required number by the time it gets here.
 */
export interface SettlementBase {
  amount?: number | string | null;
  cfdi_total?: number | string | null;
  cfdi_status?: string | null;
}

/**
 * What {@link collectedAmount} needs: the settlement base, plus a
 * `transferred_amount` the caller is **required to have selected**.
 *
 * Stated separately from `MilestoneItem` so every caller — the UI's rows, the
 * assistant's context rows, the admin panel's two-column projection — states
 * the same obligation without pretending to be a full milestone (#351).
 */
export interface CollectedBase extends SettlementBase {
  id?: string;
  status?: string | null;
  transferred_amount: number | string | null;
}

/**
 * The columns any read of `milestones` must take before it computes money.
 *
 * `amount` alone answers "what was agreed", never "what is owed" or "what
 * arrived": `expectedSettlementAmount` needs `cfdi_total`/`cfdi_status` to know
 * which document governs, and `collectedAmount` needs `transferred_amount` to
 * know what the wire actually carried. Two selects took `amount` without them
 * and reported a $20,000 wire against a $48,720 cobro as fully collected —
 * on the dashboard KPI cards and in the assistant's answer (#351, #253).
 *
 * `tests/unit/milestoneMoneySelects.test.ts` reads this list and fails the
 * build on the next `.from('milestones').select(…)` that names `amount`
 * without the rest.
 */
export const MILESTONE_MONEY_COLUMNS = [
  'amount',
  'transferred_amount',
  'cfdi_total',
  'cfdi_status',
] as const;

/** Reads a numeric column PostgREST may hand back as a string. */
function toAmount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What this cobro has to be paid to be settled — the figure every other
 * calculation here measures against.
 *
 * The PAC recomputes taxes from the pre-tax base, so the stamped total and the
 * milestone amount can differ by a rounding step. `planPaymentComplement`
 * already tracked the balance against `cfdi_total` for that reason — it is the
 * document the SAT reconciles against — while the confirm modal prefilled from
 * `amount` and this module measured "collected" and "outstanding" against
 * `amount` too. One base out of three disagreeing is enough to manufacture a
 * centavo out of nothing, and it did, in both directions (#341):
 *
 *   - prefill `amount` ($10,000.00) against a `cfdi_total` of $9,999.99 and
 *     the client who pays exactly what the modal proposed trips the #81
 *     overpayment notice — the product telling Don Roberto to refund $0.01.
 *   - prefill `cfdi_total` while *this* module still measures `amount`, and
 *     the mirror appears: `outstandingAmount` returns $0.01, the cobro is
 *     counted `countPartial`, and it sits in an aging bucket owing a centavo
 *     that no one will ever wire.
 *
 * So the base is defined once, here, and everything reads it: the complement
 * plan, the collected/outstanding pair below, and the modal's prefill. The two
 * sides agree by construction rather than by both being written carefully.
 *
 * A **cancelled** CFDI settles nothing — the document is void, so the
 * contractual amount governs again. `planPaymentComplement` already refuses
 * cancelled invoices before it reaches a total, so this guard changes nothing
 * there and only keeps the receivable honest.
 */
export function expectedSettlementAmount(
  item: SettlementBase | null | undefined
): number {
  const contractual = toAmount(item?.amount);
  if (item?.cfdi_status === 'cancelled') return round(contractual);

  const stamped = toAmount(item?.cfdi_total);
  return round(stamped > 0 ? stamped : contractual);
}

export interface ReceivablesSummary {
  totalOverdue: number;
  totalDueToday: number;
  totalUpcoming: number;
  totalConfirmed: number;
  totalPending: number;
  countOverdue: number;
  countDueToday: number;
  countUpcoming: number;
  countConfirmed: number;
  /**
   * Confirmed cobros whose transfer came up short. They are *not* in
   * `countConfirmed` — their remainder is still owed, so they are counted in
   * whichever aging bucket their due date puts them in — but the money that did
   * arrive is in `totalConfirmed`. Every peso lands in exactly one total and
   * every row in exactly one count.
   */
  countPartial: number;
  /** What the partially-paid cobros still owe. Already inside `totalPending`. */
  totalPartialOutstanding: number;
}

const round = (val: number) => Math.round(val * 100) / 100;

/**
 * What actually arrived for this cobro.
 *
 * The confirm path deliberately accepts a figure different from the amount
 * owed — `SpeiConfirmModal` asks for "Monto Transferido Confirmado" and the
 * complemento de pago is filed for *that* number. Reading `amount` here instead
 * booked a $20,000 wire against a $48,720 milestone as $48,720 collected, while
 * Facturación showed the same cobro owing $28,720 (#253).
 *
 * Clamped to the amount owed: an overpayment is real money, but it is not
 * *this* cobro's revenue — #81 surfaces the surplus at confirmation time so the
 * tenant applies or returns it.
 */
export function collectedAmount(item: CollectedBase): number {
  if ((item?.status || 'pending') !== 'confirmed') return 0;

  // The stamped total when there is one, not the milestone amount (#341) —
  // see expectedSettlementAmount for why one base has to serve all three.
  const owed = expectedSettlementAmount(item);

  // "The column was never selected" and "the column is NULL" are different
  // facts, and reading them alike is what let the KPI cards book a partial
  // wire as paid in full (#351). Only a row that *carries* the key gets the
  // legacy reading below; a row missing it is a caller that did not ask.
  if (!hasDeclaredTransfer(item)) {
    // Nothing here can be right: the row simply does not say what arrived.
    // Keeping the historical reading avoids swapping one wrong figure for
    // another mid-incident, but it must never be reached quietly — the type
    // and the select gate exist so it cannot be, and this says so out loud if
    // one of them is ever bypassed.
    console.error(
      '[receivables] collectedAmount read a milestone with no transferred_amount key — ' +
        'the query omitted the column, so this figure overstates what arrived (#351). ' +
        `milestone=${item?.id ?? 'desconocido'}`
    );
    return owed;
  }

  const declared = item.transferred_amount;
  // A row confirmed before the column carried a figure recorded "the full
  // amount arrived", which is what the confirmation meant. A row that carries
  // 0 means zero arrived, and `??` keeps it 0 where `||` would not.
  const transferred = declared === null || declared === undefined ? owed : Number(declared);

  if (!Number.isFinite(transferred) || transferred < 0) return owed;
  return round(Math.min(transferred, owed));
}

/** Did this row's query actually select `transferred_amount`? (#351) */
function hasDeclaredTransfer(item: CollectedBase | null | undefined): boolean {
  return (
    item != null &&
    typeof item === 'object' &&
    Object.prototype.hasOwnProperty.call(item, 'transferred_amount')
  );
}

/** What this cobro still owes. */
export function outstandingAmount(item: CollectedBase): number {
  const owed = expectedSettlementAmount(item);
  return round(Math.max(owed - collectedAmount(item), 0));
}

/**
 * What the tenant has recorded as received against a cobro that is **still
 * open** — the figure the public payment page discloses (#371).
 *
 * `collectedAmount` cannot answer this and should not be changed to: it gates
 * on `status === 'confirmed'` because a declaration the owner has not confirmed
 * is not revenue, and every KPI, aging bucket and export depends on that. But
 * `/pay/[token]` only ever serves a `pending`/`requested` milestone
 * (`pickPayableMilestone`), so `collectedAmount` there is always 0 and
 * `outstandingAmount` always equals the full settlement figure. That is why
 * #371's proposed swap to `outstandingAmount` changes no number on that page:
 * the two functions are identical over the only rows it can reach.
 *
 * A still-open milestone carrying a `transferred_amount` is the owner having
 * recorded a partial wire through `PUT /api/receivables/[id]` and left the
 * cobro open for the rest — a tenant-entered fact, not a payer's claim, which
 * is what makes it safe to show the payer. Clamped to the settlement figure:
 * disclosing more received than owed would invite a refund conversation this
 * page cannot support.
 *
 * This **is** now subtracted from the figure `/pay/[token]` asks for, which it
 * was not when this function was written. The blocker was that
 * `POST /api/receivables/public/[token]` *overwrote* `transferred_amount`, so
 * asking a payer for the remainder would have erased the record of the first
 * wire. #381 made declarations accumulate — the route adds on the row itself,
 * through `record_milestone_payment` — and the two halves had to ship together:
 * accumulating while still asking for the full sum makes the total overshoot
 * instead of undershoot.
 */
export function recordedTransferAmount(item: CollectedBase): number {
  if (!hasDeclaredTransfer(item)) return 0;

  const declared = item.transferred_amount;
  if (declared === null || declared === undefined) return 0;

  const amount = Number(declared);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  return round(Math.min(amount, expectedSettlementAmount(item)));
}

/**
 * What still needs recording against this cobro: the settlement figure less
 * everything already logged, payer declaration and owner record alike.
 *
 * **Not `outstandingAmount`**, and the difference is money. `outstandingAmount`
 * subtracts `collectedAmount`, which is 0 on anything not yet `confirmed` — so
 * on a `marked_paid` cobro carrying a payer's declared $20,000 it returns the
 * *full* $48,720. Two surfaces need the other question answered:
 *
 *   - the confirm modal's prefill, where proposing the full total would record
 *     the payer's declaration a second time (caught in PR #402 before it
 *     shipped);
 *   - `pickPayableMilestone`, which has to tell "this cobro still owes
 *     something" from "everything recorded covers it" while the status is
 *     still `marked_paid` (#382).
 *
 * Both used to work it out locally. Two copies of a subtraction over money is
 * how one of them ends up reading the wrong base — exactly #341's shape — so it
 * is defined once here and both read it.
 */
export function remainingToRecord(item: CollectedBase | null | undefined): number {
  if (!item) return 0;
  return round(Math.max(expectedSettlementAmount(item) - recordedTransferAmount(item), 0));
}

/** Statuses that still represent money the organization expects to receive. */
const COLLECTABLE_STATUSES = new Set(['pending', 'requested', 'marked_paid', 'confirmed']);

export type AgingBucket = 'overdue' | 'due_today' | 'upcoming';

/**
 * Which aging bucket this cobro belongs to, or `null` when it owes nothing.
 *
 * The single predicate behind both the summary cards and the list filter. They
 * used to disagree twice over: the cards counted `marked_paid` rows as overdue
 * while the *Atrasados* tab hid them, and a partially-paid cobro appeared in
 * neither (#253).
 */
export function agingBucketOf(item: MilestoneItem, todayStr: string): AgingBucket | null {
  if (!COLLECTABLE_STATUSES.has(item?.status || 'pending')) return null;
  if (outstandingAmount(item) <= 0) return null;

  const dueDate = item?.due_date ? item.due_date.substring(0, 10) : '';
  if (dueDate < todayStr) return 'overdue';
  if (dueDate === todayStr) return 'due_today';
  return 'upcoming';
}

/**
 * Calculates financial totals for receivables categorized by due date and status.
 */
export function calculateReceivablesSummary(
  milestones: MilestoneItem[],
  todayStr?: string
): ReceivablesSummary {
  // Local today, never UTC's: from 18:00 in Mexico the UTC date is
  // tomorrow, and every cobro due today read Atrasado all evening (#263).
  const today = todayStr || localTodayStr();

  let totalOverdue = 0;
  let totalDueToday = 0;
  let totalUpcoming = 0;
  let totalConfirmed = 0;

  let countOverdue = 0;
  let countDueToday = 0;
  let countUpcoming = 0;
  let countConfirmed = 0;
  let countPartial = 0;
  let totalPartialOutstanding = 0;

  if (Array.isArray(milestones)) {
    milestones.forEach((item) => {
      // Two independent questions, asked separately: how much of this cobro has
      // arrived, and how much of it is still owed. A partially-paid cobro
      // answers both with a number greater than zero.
      const collected = collectedAmount(item);
      const outstanding = outstandingAmount(item);
      const isConfirmed = (item.status || 'pending') === 'confirmed';

      totalConfirmed += collected;

      if (isConfirmed && outstanding <= 0) {
        countConfirmed += 1;
      } else if (isConfirmed) {
        countPartial += 1;
        totalPartialOutstanding += outstanding;
      }

      const bucket = agingBucketOf(item, today);
      if (bucket === 'overdue') {
        totalOverdue += outstanding;
        countOverdue += 1;
      } else if (bucket === 'due_today') {
        totalDueToday += outstanding;
        countDueToday += 1;
      } else if (bucket === 'upcoming') {
        totalUpcoming += outstanding;
        countUpcoming += 1;
      }
    });
  }

  const summary: ReceivablesSummary = {
    totalOverdue: round(totalOverdue),
    totalDueToday: round(totalDueToday),
    totalUpcoming: round(totalUpcoming),
    totalConfirmed: round(totalConfirmed),
    totalPending: round(totalOverdue + totalDueToday + totalUpcoming),
    countOverdue,
    countDueToday,
    countUpcoming,
    countConfirmed,
    countPartial,
    totalPartialOutstanding: round(totalPartialOutstanding),
  };

  return summary;
}

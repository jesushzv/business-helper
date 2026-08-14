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
  transferred_amount?: number | null;
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
export function collectedAmount(item: MilestoneItem): number {
  if ((item?.status || 'pending') !== 'confirmed') return 0;

  // The stamped total when there is one, not the milestone amount (#341) —
  // see expectedSettlementAmount for why one base has to serve all three.
  const owed = expectedSettlementAmount(item);
  const declared = item?.transferred_amount;
  // Absent is absent: a row confirmed before the column carried a figure means
  // "the full amount arrived", which is what the confirmation recorded. A row
  // that carries 0 means zero arrived, and `?? ` keeps it 0 where `||` would not.
  const transferred = declared === null || declared === undefined ? owed : Number(declared);

  if (!Number.isFinite(transferred) || transferred < 0) return owed;
  return round(Math.min(transferred, owed));
}

/** What this cobro still owes. */
export function outstandingAmount(item: MilestoneItem): number {
  const owed = expectedSettlementAmount(item);
  return round(Math.max(owed - collectedAmount(item), 0));
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

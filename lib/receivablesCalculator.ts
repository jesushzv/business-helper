/**
 * Business Helper — Receivables Aging & Summary Calculator
 */

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

  const owed = Number(item?.amount) || 0;
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
  const owed = Number(item?.amount) || 0;
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
  const today = todayStr || new Date().toISOString().split('T')[0];

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

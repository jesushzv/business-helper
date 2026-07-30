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

  if (Array.isArray(milestones)) {
    milestones.forEach((item) => {
      const amt = Number(item.amount) || 0;
      const status = item.status || 'pending';
      const dueDate = item.due_date ? item.due_date.substring(0, 10) : '';

      if (status === 'confirmed') {
        totalConfirmed += amt;
        countConfirmed += 1;
      } else if (status === 'pending' || status === 'requested' || status === 'marked_paid') {
        if (dueDate < today) {
          totalOverdue += amt;
          countOverdue += 1;
        } else if (dueDate === today) {
          totalDueToday += amt;
          countDueToday += 1;
        } else {
          totalUpcoming += amt;
          countUpcoming += 1;
        }
      }
    });
  }

  const round = (val: number) => Math.round(val * 100) / 100;

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
  };

  return summary;
}

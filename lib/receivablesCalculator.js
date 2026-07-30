/**
 * Business Helper — Receivables Aging & Summary Calculator (JS Runtime export)
 */

function calculateReceivablesSummary(milestones, todayStr) {
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

  const round = (val) => Math.round(val * 100) / 100;

  return {
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
}

module.exports = {
  calculateReceivablesSummary,
};

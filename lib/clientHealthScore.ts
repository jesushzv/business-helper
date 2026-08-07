/**
 * Business Helper — Client Health Score Engine (0-100 Rating)
 * 
 * Computes a payment reliability score for clients based on historical
 * milestone payment timeliness.
 */

export interface MilestonePaymentRecord {
  status: 'pending' | 'requested' | 'marked_paid' | 'confirmed' | string;
  due_date: string;
  confirmed_at?: string | null;
  amount?: number;
}

export interface ClientHealthResult {
  score: number; // 0 to 100
  rating: 'Excelente' | 'Bueno' | 'En Riesgo' | 'Moroso';
  color: 'emerald' | 'blue' | 'amber' | 'red';
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
}

function toUtcMidnight(dateInput: string | Date): Date {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function calculateClientHealthScore(milestones: MilestonePaymentRecord[] | null | undefined): ClientHealthResult {
  if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
    return {
      score: 100,
      rating: 'Excelente',
      color: 'emerald',
      totalPaid: 0,
      totalPending: 0,
      totalOverdue: 0,
    };
  }

  let score = 100;
  let totalPaid = 0;
  let totalPending = 0;
  let totalOverdue = 0;

  const now = new Date();
  const todayUtc = toUtcMidnight(now);

  for (const m of milestones) {
    const dueDate = toUtcMidnight(m.due_date);
    const amount = Number(m.amount) || 0;

    if (m.status === 'confirmed') {
      totalPaid += amount;
      if (m.confirmed_at) {
        const confirmedDate = toUtcMidnight(m.confirmed_at);
        const daysLate = Math.floor((confirmedDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLate > 7) {
          score -= 15;
        } else if (daysLate > 0) {
          score -= 5;
        }
      }
    } else if (m.status === 'pending' || m.status === 'requested' || m.status === 'marked_paid') {
      totalPending += amount;
      if (dueDate < todayUtc) {
        totalOverdue += amount;
        const daysOverdue = Math.floor((todayUtc.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 30) {
          score -= 40;
        } else if (daysOverdue > 7) {
          score -= 25;
        } else if (daysOverdue > 0) {
          score -= 10;
        }
      }
    }
  }

  // Bound score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let rating: ClientHealthResult['rating'] = 'Excelente';
  let color: ClientHealthResult['color'] = 'emerald';

  if (finalScore >= 90) {
    rating = 'Excelente';
    color = 'emerald';
  } else if (finalScore >= 75) {
    rating = 'Bueno';
    color = 'blue';
  } else if (finalScore >= 50) {
    rating = 'En Riesgo';
    color = 'amber';
  } else {
    rating = 'Moroso';
    color = 'red';
  }

  return {
    score: finalScore,
    rating,
    color,
    totalPaid,
    totalPending,
    totalOverdue,
  };
}

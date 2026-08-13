/**
 * Business Helper — Dashboard Financial Analytics & Cash Flow Calculator
 * 
 * Provides core aggregation functions for business financial health metrics:
 * 1. Business Metrics Aggregator (Collected Revenue, Pending Receivables, Overdue Debt)
 * 2. Top Clients Ranking Leaderboard
 * 3. 30/60/90-Day Cash Flow Forecast Timeline
 */

export interface MilestoneItem {
  id: string;
  contract_id?: string;
  client_id?: string;
  label: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'requested' | 'marked_paid' | 'confirmed';
  confirmed_at?: string | null;
}

export interface QuoteItem {
  id: string;
  client_id?: string;
  status: string;
  total_amount: number;
}

export interface ClientItem {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  /** Absent or null = no score on record (#276). */
  health_score?: number | null;
  rfc?: string | null;
}

export interface BusinessMetrics {
  collectedRevenue: number;
  pendingReceivables: number;
  overdueDebt: number;
  dueTodayAmount: number;
  upcomingAmount: number;
  activeClientsCount: number;
  acceptedQuotesCount: number;
  totalMilestonesCount: number;
}

export interface TopClientRevenue {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  /** `null` = no score on record. Never invented as 100 (#108, #276). */
  health_score: number | null;
  rfc: string;
  totalRevenue: number;
  confirmedMilestonesCount: number;
}

export interface CashFlowForecastBucket {
  periodLabel: string;
  daysRange: string;
  amount: number;
  count: number;
}

export interface CashFlowForecast {
  referenceDate: string;
  days30: CashFlowForecastBucket;
  days60: CashFlowForecastBucket;
  days90: CashFlowForecastBucket;
  totalForecast: number;
}

/**
 * Calculates high-level business financial health metrics.
 */
export function calculateBusinessMetrics(
  milestones: MilestoneItem[] = [],
  quotes: QuoteItem[] = [],
  clients: ClientItem[] = [],
  todayStr?: string
): BusinessMetrics {
  const today = todayStr ? new Date(todayStr) : new Date();
  today.setHours(0, 0, 0, 0);

  let collectedRevenue = 0;
  let pendingReceivables = 0;
  let overdueDebt = 0;
  let dueTodayAmount = 0;
  let upcomingAmount = 0;

  milestones.forEach((m) => {
    const amt = Number(m.amount) || 0;
    if (m.status === 'confirmed') {
      collectedRevenue += amt;
    } else {
      pendingReceivables += amt;
      const dueDate = new Date(m.due_date);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        overdueDebt += amt;
      } else if (dueDate.getTime() === today.getTime()) {
        dueTodayAmount += amt;
      } else {
        upcomingAmount += amt;
      }
    }
  });

  const acceptedQuotesCount = quotes.filter((q) => q.status === 'accepted' || q.status === 'converted').length;

  return {
    collectedRevenue: Math.round(collectedRevenue * 100) / 100,
    pendingReceivables: Math.round(pendingReceivables * 100) / 100,
    overdueDebt: Math.round(overdueDebt * 100) / 100,
    dueTodayAmount: Math.round(dueTodayAmount * 100) / 100,
    upcomingAmount: Math.round(upcomingAmount * 100) / 100,
    activeClientsCount: clients.length,
    acceptedQuotesCount,
    totalMilestonesCount: milestones.length,
  };
}

/**
 * Ranks clients by total confirmed revenue.
 */
export function getTopClientsByRevenue(
  milestones: MilestoneItem[] = [],
  clients: ClientItem[] = [],
  topN: number = 5
): TopClientRevenue[] {
  const clientRevenueMap: Record<string, { totalRevenue: number; count: number }> = {};

  milestones.forEach((m) => {
    if (m.status === 'confirmed' && m.client_id) {
      const amt = Number(m.amount) || 0;
      if (!clientRevenueMap[m.client_id]) {
        clientRevenueMap[m.client_id] = { totalRevenue: 0, count: 0 };
      }
      clientRevenueMap[m.client_id].totalRevenue += amt;
      clientRevenueMap[m.client_id].count += 1;
    }
  });

  const rankedClients: TopClientRevenue[] = clients
    .map((client) => {
      const stats = clientRevenueMap[client.id] || { totalRevenue: 0, count: 0 };
      return {
        id: client.id,
        name: client.name || 'Cliente sin nombre',
        contact_name: client.contact_name || '',
        phone: client.phone || '',
        // Absent is absent (#276): the `: 100` fallback here manufactured an
        // "Excelente" judgment for clients with no score on record.
        health_score: typeof client.health_score === 'number' ? client.health_score : null,
        rfc: client.rfc || '',
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
        confirmedMilestonesCount: stats.count,
      };
    })
    // A leaderboard "por Facturación" ranks money that arrived. Without this
    // filter a new tenant's dashboard listed every client at $0.00 and the
    // empty state was unreachable (#277).
    .filter((client) => client.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return rankedClients.slice(0, topN);
}

/**
 * Calculates projected 30-day, 60-day, and 90-day cash inflows from active milestones.
 */
export function calculateCashFlowForecast(
  milestones: MilestoneItem[] = [],
  referenceDateStr?: string
): CashFlowForecast {
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  refDate.setHours(0, 0, 0, 0);

  const days30Bucket: CashFlowForecastBucket = {
    periodLabel: 'Próximos 30 Días',
    daysRange: '0 - 30 días',
    amount: 0,
    count: 0,
  };

  const days60Bucket: CashFlowForecastBucket = {
    periodLabel: 'De 31 a 60 Días',
    daysRange: '31 - 60 días',
    amount: 0,
    count: 0,
  };

  const days90Bucket: CashFlowForecastBucket = {
    periodLabel: 'De 61 a 90 Días',
    daysRange: '61 - 90 días',
    amount: 0,
    count: 0,
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  milestones.forEach((m) => {
    // Only pending/requested/marked_paid milestones are relevant for cash flow forecast
    if (m.status !== 'confirmed') {
      const dueDate = new Date(m.due_date);
      dueDate.setHours(0, 0, 0, 0);

      const diffMs = dueDate.getTime() - refDate.getTime();
      const diffDays = Math.floor(diffMs / ONE_DAY_MS);

      const amt = Number(m.amount) || 0;

      if (diffDays >= 0 && diffDays <= 30) {
        days30Bucket.amount += amt;
        days30Bucket.count += 1;
      } else if (diffDays >= 31 && diffDays <= 60) {
        days60Bucket.amount += amt;
        days60Bucket.count += 1;
      } else if (diffDays >= 61 && diffDays <= 90) {
        days90Bucket.amount += amt;
        days90Bucket.count += 1;
      }
    }
  });

  days30Bucket.amount = Math.round(days30Bucket.amount * 100) / 100;
  days60Bucket.amount = Math.round(days60Bucket.amount * 100) / 100;
  days90Bucket.amount = Math.round(days90Bucket.amount * 100) / 100;

  const totalForecast = Math.round((days30Bucket.amount + days60Bucket.amount + days90Bucket.amount) * 100) / 100;

  return {
    referenceDate: refDate.toISOString().split('T')[0],
    days30: days30Bucket,
    days60: days60Bucket,
    days90: days90Bucket,
    totalForecast,
  };
}

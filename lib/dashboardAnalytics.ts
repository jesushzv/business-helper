/**
 * Business Helper — Dashboard Financial Analytics & Cash Flow Calculator
 * 
 * Provides core aggregation functions for business financial health metrics:
 * 1. Business Metrics Aggregator (Collected Revenue, Pending Receivables, Overdue Debt)
 * 2. Top Clients Ranking Leaderboard
 * 3. 30/60/90-Day Cash Flow Forecast Timeline
 *
 * "Collected" and "still owed" are defined once, in `lib/receivablesCalculator`,
 * and imported here. Two screens deriving the same money two ways is how
 * Cobranza and Facturación came to disagree about one cobro (#253).
 */

import { collectedAmount, outstandingAmount } from './receivablesCalculator';
import { daysBetween, localTodayStr } from './dates';

export interface MilestoneItem {
  id: string;
  contract_id?: string;
  client_id?: string;
  label: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'requested' | 'marked_paid' | 'confirmed';
  /** What the owner confirmed actually arrived; may be less than `amount` (#253). */
  transferred_amount?: number | null;
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
  /**
   * How many cobros make up `pendingReceivables` — the same subset, not every
   * milestone ever created. It was `milestones.length`, so an org that had
   * collected all twelve of its cobros read "$0.00 / 12 hitos registrados"
   * under a card headed *Por Cobrar (Pendiente)* (#297).
   */
  pendingMilestonesCount: number;
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
  // Date-only strings compared as strings (#263): `new Date('2026-08-14')`
  // parses as UTC midnight while `setHours(0,0,0,0)` builds LOCAL midnight,
  // so anywhere west of UTC every due date collapsed a day back — a milestone
  // due today counted as "Deuda Vencida" at any hour, and dueTodayAmount was
  // structurally unreachable in the browser.
  const today = (todayStr || localTodayStr()).substring(0, 10);

  let collectedRevenue = 0;
  let pendingReceivables = 0;
  let overdueDebt = 0;
  let dueTodayAmount = 0;
  let upcomingAmount = 0;
  let pendingMilestonesCount = 0;

  milestones.forEach((m) => {
    // Same two facts the Cobranza cards derive, from the same helpers: what
    // arrived, and what is still owed. A confirmed-but-short cobro contributes
    // to both, so the dashboard stops booking a $20,000 wire as $48,720 of
    // revenue (#253).
    collectedRevenue += collectedAmount(m);

    const outstanding = outstandingAmount(m);
    if (outstanding <= 0) return;

    pendingReceivables += outstanding;
    pendingMilestonesCount += 1;

    const dueDate = (m.due_date || '').substring(0, 10);

    if (dueDate < today) {
      overdueDebt += outstanding;
    } else if (dueDate === today) {
      dueTodayAmount += outstanding;
    } else {
      upcomingAmount += outstanding;
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
    pendingMilestonesCount,
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
      // Revenue is what the client actually transferred, not what they were
      // billed — the leaderboard ranked a $20,000 payer as a $48,720 one (#253).
      const amt = collectedAmount(m);
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
  // Same rule as calculateBusinessMetrics: date-only strings, differenced
  // through daysBetween — never round-tripped through Date's UTC parsing (#263).
  const reference = (referenceDateStr || localTodayStr()).substring(0, 10);

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

  milestones.forEach((m) => {
    // Only pending/requested/marked_paid milestones are relevant for cash flow forecast
    if (m.status !== 'confirmed') {
      const diffDays = daysBetween(reference, (m.due_date || '').substring(0, 10));

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
    referenceDate: reference,
    days30: days30Bucket,
    days60: days60Bucket,
    days90: days90Bucket,
    totalForecast,
  };
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  calculateBusinessMetrics,
  getTopClientsByRevenue,
  calculateCashFlowForecast,
} from '@/lib/dashboardAnalytics';

export async function GET() {
  try {
    const supabase = await createClient();

    // Query organization data with RLS scoping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestones } = await (supabase as any)
      .from('milestones')
      .select('id, contract_id, client_id, label, amount, due_date, status, confirmed_at');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quotes } = await (supabase as any)
      .from('quotes')
      .select('id, client_id, status, total_amount');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('id, name, contact_name, phone, health_score, rfc');

    const milestoneList = milestones || [];
    const quoteList = quotes || [];
    const clientList = clients || [];

    const metrics = calculateBusinessMetrics(milestoneList, quoteList, clientList);
    const topClients = getTopClientsByRevenue(milestoneList, clientList, 5);
    const cashFlowForecast = calculateCashFlowForecast(milestoneList);

    return NextResponse.json({
      metrics,
      topClients,
      cashFlowForecast,
    });
  } catch {
    // Return empty fallback analytics
    return NextResponse.json({
      metrics: {
        collectedRevenue: 0,
        pendingReceivables: 0,
        overdueDebt: 0,
        dueTodayAmount: 0,
        upcomingAmount: 0,
        activeClientsCount: 0,
        acceptedQuotesCount: 0,
        totalMilestonesCount: 0,
      },
      topClients: [],
      cashFlowForecast: {
        referenceDate: new Date().toISOString().split('T')[0],
        days30: { periodLabel: 'Próximos 30 Días', daysRange: '0 - 30 días', amount: 0, count: 0 },
        days60: { periodLabel: 'De 31 a 60 Días', daysRange: '31 - 60 días', amount: 0, count: 0 },
        days90: { periodLabel: 'De 61 a 90 Días', daysRange: '61 - 90 días', amount: 0, count: 0 },
        totalForecast: 0,
      },
    });
  }
}

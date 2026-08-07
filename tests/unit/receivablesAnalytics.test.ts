import { describe, it, expect } from 'vitest';
import { calculateReceivablesSummary, type MilestoneItem } from '@/lib/receivablesCalculator';
import {
  calculateBusinessMetrics,
  getTopClientsByRevenue,
  calculateCashFlowForecast,
  type MilestoneItem as AnalyticsMilestone,
} from '@/lib/dashboardAnalytics';

describe('Receivables Aging & Summary Calculator', () => {
  const today = '2026-08-30';
  const milestones: MilestoneItem[] = [
    { id: 'm1', label: 'Anticipo 50%', amount: 5000, due_date: '2026-08-15', status: 'pending' },
    { id: 'm2', label: 'Entrega 1', amount: 3000, due_date: '2026-08-30', status: 'requested' },
    { id: 'm3', label: 'Finiquito', amount: 7000, due_date: '2026-09-15', status: 'pending' },
    { id: 'm4', label: 'Fase Inicial', amount: 4000, due_date: '2026-08-01', status: 'confirmed' },
  ];

  it('buckets amounts into overdue, due today, upcoming and confirmed', () => {
    const summary = calculateReceivablesSummary(milestones, today);

    expect(summary.totalOverdue).toBe(5000);
    expect(summary.totalDueToday).toBe(3000);
    expect(summary.totalUpcoming).toBe(7000);
    expect(summary.totalConfirmed).toBe(4000);
  });

  it('counts a confirmed milestone as collected rather than pending', () => {
    const summary = calculateReceivablesSummary(milestones, today);

    expect(summary.totalPending).toBe(15000);
    expect(summary.countConfirmed).toBe(1);
  });
});

describe('Business Dashboard Analytics Engine', () => {
  const today = '2026-08-30';

  it('separates collected revenue from pending and overdue receivables', () => {
    const metrics = calculateBusinessMetrics(
      [
        { id: 'm1', label: 'Anticipo', amount: 10000, due_date: '2026-08-10', status: 'confirmed' },
        { id: 'm2', label: 'Entrega 1', amount: 5000, due_date: '2026-08-20', status: 'pending' },
        { id: 'm3', label: 'Finiquito', amount: 15000, due_date: '2026-09-10', status: 'requested' },
      ],
      [
        { id: 'q1', status: 'accepted', total_amount: 30000 },
        { id: 'q2', status: 'draft', total_amount: 12000 },
      ],
      [
        { id: 'c1', name: 'Cliente Uno' },
        { id: 'c2', name: 'Cliente Dos' },
      ],
      today
    );

    expect(metrics.collectedRevenue).toBe(10000);
    expect(metrics.pendingReceivables).toBe(20000);
    expect(metrics.overdueDebt).toBe(5000);
    expect(metrics.activeClientsCount).toBe(2);
    expect(metrics.acceptedQuotesCount).toBe(1);
  });

  it('ranks clients by confirmed revenue and honours the limit', () => {
    const milestones: AnalyticsMilestone[] = [
      { id: 'm1', client_id: 'c1', label: 'Hito', amount: 20000, due_date: today, status: 'confirmed' },
      { id: 'm2', client_id: 'c1', label: 'Hito', amount: 15000, due_date: today, status: 'confirmed' },
      { id: 'm3', client_id: 'c2', label: 'Hito', amount: 10000, due_date: today, status: 'confirmed' },
      { id: 'm4', client_id: 'c3', label: 'Hito', amount: 50000, due_date: today, status: 'confirmed' },
    ];
    const clients = [
      { id: 'c1', name: 'Construcciones Maya' },
      { id: 'c2', name: 'Materiales del Norte' },
      { id: 'c3', name: 'Servicios Logísticos' },
    ];

    const top = getTopClientsByRevenue(milestones, clients, 2);

    expect(top).toHaveLength(2);
    expect(top[0].id).toBe('c3');
    expect(top[0].totalRevenue).toBe(50000);
    expect(top[1].id).toBe('c1');
    expect(top[1].totalRevenue).toBe(35000);
  });

  it('buckets pending milestones into 30/60/90-day forecast windows', () => {
    const forecast = calculateCashFlowForecast(
      [
        { id: 'm1', label: 'Hito', amount: 10000, due_date: '2026-09-10', status: 'pending' },
        { id: 'm2', label: 'Hito', amount: 20000, due_date: '2026-10-15', status: 'requested' },
        { id: 'm3', label: 'Hito', amount: 15000, due_date: '2026-11-20', status: 'pending' },
      ],
      today
    );

    expect(forecast.days30).toMatchObject({ amount: 10000, count: 1 });
    expect(forecast.days60).toMatchObject({ amount: 20000, count: 1 });
    expect(forecast.days90).toMatchObject({ amount: 15000, count: 1 });
    expect(forecast.totalForecast).toBe(45000);
  });

  it('excludes past-due and already-confirmed milestones from the forward forecast', () => {
    const forecast = calculateCashFlowForecast(
      [
        { id: 'm4', label: 'Vencido', amount: 5000, due_date: '2026-08-15', status: 'pending' },
        { id: 'm5', label: 'Cobrado', amount: 8000, due_date: '2026-09-05', status: 'confirmed' },
      ],
      today
    );

    expect(forecast.totalForecast).toBe(0);
  });
});

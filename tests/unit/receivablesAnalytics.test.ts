import { describe, it, expect } from 'vitest';
import {
  agingBucketOf,
  calculateReceivablesSummary,
  collectedAmount,
  outstandingAmount,
  type MilestoneItem,
} from '@/lib/receivablesCalculator';
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

/**
 * #253 — a partial payment is not a collected cobro.
 *
 * The confirm path deliberately records what *arrived* ("Monto Transferido
 * Confirmado"), and the complemento de pago is filed for that figure — but
 * every summary read `amount` instead, so a $20,000 wire against a $48,720
 * milestone moved the full $48,720 into "Cobrado" and the row left every
 * pending bucket, while Facturación showed the same cobro owing $28,720.
 *
 * The fixtures below all carry `transferred_amount !== amount`; the ones above
 * never did, which is why a green suite sat on top of this.
 */
describe('partially paid cobros', () => {
  const today = '2026-08-30';
  const partial: MilestoneItem = {
    id: 'p1',
    label: 'Anticipo 50%',
    amount: 48720,
    transferred_amount: 20000,
    due_date: '2026-08-15',
    status: 'confirmed',
  };

  it('splits one cobro into what arrived and what is still owed', () => {
    expect(collectedAmount(partial)).toBe(20000);
    expect(outstandingAmount(partial)).toBe(28720);
  });

  it('leaves the remainder in the aging bucket its due date puts it in', () => {
    expect(agingBucketOf(partial, today)).toBe('overdue');

    const summary = calculateReceivablesSummary([partial], today);

    expect(summary.totalConfirmed).toBe(20000);
    expect(summary.totalOverdue).toBe(28720);
    // Counted once: still owed, so not among the settled.
    expect(summary.countConfirmed).toBe(0);
    expect(summary.countOverdue).toBe(1);
    expect(summary.countPartial).toBe(1);
    expect(summary.totalPartialOutstanding).toBe(28720);
  });

  it('never books more than the cobro is worth when the client overpaid', () => {
    // The surplus is real money, but it is not this cobro's revenue — #81
    // surfaces it at confirmation time so the tenant applies or returns it.
    const overpaid = { ...partial, transferred_amount: 50000 };

    expect(collectedAmount(overpaid)).toBe(48720);
    expect(outstandingAmount(overpaid)).toBe(0);
    expect(agingBucketOf(overpaid, today)).toBeNull();
  });

  it('reads a confirmation that recorded no figure as fully paid', () => {
    // Rows confirmed before the column carried a number: the confirmation
    // itself recorded "the amount arrived".
    const legacy = { ...partial, transferred_amount: null };

    expect(collectedAmount(legacy)).toBe(48720);
    expect(calculateReceivablesSummary([legacy], today).countConfirmed).toBe(1);
  });

  it('keeps an explicit zero at zero rather than falling back to the amount', () => {
    // `transferred_amount || amount` would read this as fully collected.
    const nothing = { ...partial, transferred_amount: 0 };

    expect(collectedAmount(nothing)).toBe(0);
    expect(outstandingAmount(nothing)).toBe(48720);
  });

  it('carries the same split into the dashboard metrics', () => {
    const metrics = calculateBusinessMetrics([partial as AnalyticsMilestone], [], [], today);

    expect(metrics.collectedRevenue).toBe(20000);
    expect(metrics.pendingReceivables).toBe(28720);
    expect(metrics.overdueDebt).toBe(28720);
  });

  it('ranks a client by what they transferred, not what they were billed', () => {
    const top = getTopClientsByRevenue(
      [{ ...partial, client_id: 'c1' } as AnalyticsMilestone],
      [{ id: 'c1', name: 'Constructora del Bajío' }],
      5
    );

    expect(top[0].totalRevenue).toBe(20000);
  });
});

/**
 * #297 — the count under an amount describes the amount's own cobros.
 *
 * `totalMilestonesCount` was `milestones.length` across every status, printed
 * under *Por Cobrar (Pendiente)*, whose figure excludes collected ones. An org
 * that had collected all twelve of its cobros read "$0.00 / 12 hitos".
 */
describe('the Por Cobrar count and its amount are one derived pair', () => {
  const today = '2026-08-30';

  it('counts nothing pending once every cobro is collected', () => {
    const metrics = calculateBusinessMetrics(
      [
        { id: 'm1', label: 'A', amount: 10000, due_date: '2026-08-10', status: 'confirmed' },
        { id: 'm2', label: 'B', amount: 5000, due_date: '2026-08-20', status: 'confirmed' },
      ],
      [],
      [],
      today
    );

    expect(metrics.pendingReceivables).toBe(0);
    expect(metrics.pendingMilestonesCount).toBe(0);
    expect(metrics.collectedRevenue).toBe(15000);
  });

  it('counts a partially paid cobro among the pending, since it still owes', () => {
    const metrics = calculateBusinessMetrics(
      [
        { id: 'm1', label: 'A', amount: 10000, transferred_amount: 4000, due_date: '2026-08-10', status: 'confirmed' },
        { id: 'm2', label: 'B', amount: 5000, due_date: '2026-09-20', status: 'pending' },
      ],
      [],
      [],
      today
    );

    expect(metrics.pendingMilestonesCount).toBe(2);
    expect(metrics.pendingReceivables).toBe(11000);
  });
});

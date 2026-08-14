import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { localTodayStr, daysBetween, formatDateOnlyEs } from '@/lib/dates';
import { calculateReceivablesSummary, agingBucketOf } from '@/lib/receivablesCalculator';
import { calculateBusinessMetrics, calculateCashFlowForecast } from '@/lib/dashboardAnalytics';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import type { MilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * #263 — "today" is the tenant's evening, not UTC's tomorrow.
 *
 * Mexico is UTC-6: from 18:00 local, `new Date().toISOString().split('T')[0]`
 * is tomorrow, so a cobro due today read **Atrasado** all evening, its amount
 * moved into the Atrasado KPI, and the WhatsApp reminder told the client they
 * were late on the due date. Separately, the analytics fallback parsed
 * date-only strings as UTC midnight but built "today" from local midnight, so
 * west of UTC every due date collapsed a day back at ANY hour.
 *
 * The whole file runs pinned to America/Monterrey with the clock frozen at
 * 19:00 on the due date — the exact reproduction from the issue. process.env.TZ
 * is restored afterward so no other suite inherits the zone.
 */

const DUE_TODAY = '2026-08-14';
// 19:00 in Monterrey (UTC-6) on the due date = 01:00Z the NEXT day.
const EVENING = new Date('2026-08-15T01:00:00Z');

const originalTZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Monterrey';
});

afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EVENING);
});

afterEach(() => {
  vi.useRealTimers();
});

const milestone = (over: Record<string, unknown> = {}) => ({
  id: 'm-1',
  contract_id: 'c-1',
  organization_id: 'org-1',
  label: 'Anticipo',
  amount: 24500,
  due_date: DUE_TODAY,
  status: 'pending',
  ...over,
});

describe('lib/dates (#263)', () => {
  it('localTodayStr is the LOCAL date at 19:00, not UTC tomorrow', () => {
    expect(localTodayStr()).toBe(DUE_TODAY);
    // The habit it replaces answers tomorrow at this hour.
    expect(new Date().toISOString().split('T')[0]).toBe('2026-08-15');
  });

  it('daysBetween differences date-only strings with no zone in the path', () => {
    expect(daysBetween('2026-08-14', '2026-08-14')).toBe(0);
    expect(daysBetween('2026-08-14', '2026-08-15')).toBe(1);
    expect(daysBetween('2026-08-14', '2026-07-14')).toBe(-31);
    expect(daysBetween('2026-08-14', '2026-09-13')).toBe(30);
  });

  it('formatDateOnlyEs renders the named day, not the previous one', () => {
    // new Date('2026-08-14').toLocaleDateString() would say 13 here.
    expect(formatDateOnlyEs('2026-08-14')).toMatch(/14/);
    expect(formatDateOnlyEs('2026-08-14')).toMatch(/ago/i);
    expect(formatDateOnlyEs(null)).toBe('');
    expect(formatDateOnlyEs('sin-fecha')).toBe('sin-fecha');
  });
});

describe('receivables summary at 19:00 on the due date (#263)', () => {
  it('counts the cobro as Vence Hoy, not Atrasado', () => {
    const summary = calculateReceivablesSummary([milestone()] as never);
    expect(summary.totalDueToday).toBe(24500);
    expect(summary.totalOverdue).toBe(0);
  });

  it('agingBucketOf agrees when handed the local today', () => {
    expect(agingBucketOf(milestone() as never, localTodayStr())).toBe('due_today');
  });
});

describe('dashboard analytics with no explicit today (#263)', () => {
  it('books the cobro due today as dueTodayAmount at any hour, never Deuda Vencida', () => {
    const metrics = calculateBusinessMetrics([milestone()] as never, [], []);
    expect(metrics.dueTodayAmount).toBe(24500);
    expect(metrics.overdueDebt).toBe(0);
  });

  it('keeps the cobro due today inside the 30-day forecast bucket', () => {
    const forecast = calculateCashFlowForecast([milestone()] as never);
    expect(forecast.days30.count).toBe(1);
    expect(forecast.days30.amount).toBe(24500);
    expect(forecast.referenceDate).toBe(DUE_TODAY);
  });

  it('shifts no forecast bucket a day early at the boundaries', () => {
    const at = (offsetDays: number) => {
      const [y, m, d] = DUE_TODAY.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
      return dt.toISOString().split('T')[0];
    };
    const forecast = calculateCashFlowForecast([
      milestone({ id: 'a', due_date: at(30) }),
      milestone({ id: 'b', due_date: at(31) }),
      milestone({ id: 'c', due_date: at(90) }),
    ] as never);
    expect(forecast.days30.count).toBe(1);
    expect(forecast.days60.count).toBe(1);
    expect(forecast.days90.count).toBe(1);
  });
});

describe('ReceivableCard at 19:00 on the due date (#263)', () => {
  it('badges the cobro "Vence Hoy", not "Atrasado"', () => {
    const row = {
      ...milestone(),
      receipt_url: null,
      tracking_reference: null,
      transferred_amount: null,
      confirmed_at: null,
      created_at: '2026-08-01T00:00:00Z',
      client_name: 'Constructora Río Bravo',
      client_phone: '8187654321',
      contract_title: 'Obra Nave 2',
      public_token: 'paytoken123',
    } as unknown as MilestoneWithClient;

    render(<ReceivableCard milestone={row} />);

    expect(screen.getByText('Vence Hoy')).toBeInTheDocument();
    expect(screen.queryByText('Atrasado')).toBeNull();
  });
});

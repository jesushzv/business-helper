import { describe, it, expect } from 'vitest';
import { getTopClientsByRevenue, type MilestoneItem } from '@/lib/dashboardAnalytics';

/**
 * #277 — a leaderboard "por Facturación" ranks money that arrived.
 *
 * `getTopClientsByRevenue` mapped ALL clients, defaulted missing stats to $0,
 * sorted and sliced — never filtering. A tenant who onboarded, registered
 * three clients and confirmed nothing saw a "Top Clientes" leaderboard of
 * three $0.00 rows, each badged "Excelente (100 pt)" (#276's fabrication
 * compounding it), and the card's empty state was unreachable.
 *
 * The existing suite gave every fixture client revenue, which is why a green
 * run sat on top of this.
 */

const today = '2026-08-30';

const CLIENTS = [
  { id: 'c-1', name: 'Constructora del Bajío', health_score: null },
  { id: 'c-2', name: 'Materiales del Norte', health_score: null },
  { id: 'c-3', name: 'Servicios Logísticos', health_score: 88 },
];

describe('getTopClientsByRevenue', () => {
  it('ranks nobody when nothing has been collected', () => {
    const top = getTopClientsByRevenue([], CLIENTS, 5);

    expect(top).toEqual([]);
  });

  it('excludes zero-revenue clients rather than padding the leaderboard', () => {
    const milestones: MilestoneItem[] = [
      { id: 'm-1', client_id: 'c-3', label: 'Anticipo', amount: 20000, due_date: today, status: 'confirmed' },
    ];

    const top = getTopClientsByRevenue(milestones, CLIENTS, 5);

    expect(top).toHaveLength(1);
    expect(top[0].id).toBe('c-3');
    expect(top.map((c) => c.totalRevenue).every((r) => r > 0)).toBe(true);
  });

  it('carries a null score as null — never as an invented 100 (#276)', () => {
    const milestones: MilestoneItem[] = [
      { id: 'm-1', client_id: 'c-1', label: 'Anticipo', amount: 5000, due_date: today, status: 'confirmed' },
    ];

    const top = getTopClientsByRevenue(milestones, CLIENTS, 5);

    expect(top[0].health_score).toBeNull();
  });
});

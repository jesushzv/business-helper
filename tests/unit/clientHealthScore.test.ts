import { describe, it, expect } from 'vitest';
import { calculateClientHealthScore } from '@/lib/clientHealthScore';

describe('Client Health Score Engine (0-100 Rating) Suite', () => {
  it('should return 100 Excelente for client with zero or all on-time paid milestones', () => {
    const res = calculateClientHealthScore([]);
    expect(res.score).toBe(100);
    expect(res.rating).toBe('Excelente');
    expect(res.color).toBe('emerald');
  });

  it('should evaluate Bueno rating for minor payment delays', () => {
    const pastDueDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const confirmedDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = calculateClientHealthScore([
      { status: 'confirmed', due_date: pastDueDate, confirmed_at: confirmedDate, amount: 10000 },
      { status: 'pending', due_date: pastDueDate, amount: 5000 },
    ]);
    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.score).toBeLessThan(90);
    expect(res.rating).toBe('Bueno');
    expect(res.color).toBe('blue');
  });

  it('should evaluate En Riesgo rating for moderate delays', () => {
    const pastDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = calculateClientHealthScore([
      { status: 'pending', due_date: pastDate, amount: 20000 },
      { status: 'requested', due_date: pastDate, amount: 20000 },
    ]);
    expect(res.score).toBeGreaterThanOrEqual(50);
    expect(res.score).toBeLessThan(75);
    expect(res.rating).toBe('En Riesgo');
    expect(res.color).toBe('amber');
  });

  it('should evaluate Moroso rating for >30 days overdue milestones', () => {
    const pastDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const confirmedLateDate = new Date(Date.now()).toISOString().split('T')[0];
    const oldDueDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = calculateClientHealthScore([
      { status: 'pending', due_date: pastDate, amount: 50000 },
      { status: 'requested', due_date: pastDate, amount: 30000 },
      { status: 'confirmed', due_date: oldDueDate, confirmed_at: confirmedLateDate, amount: 10000 },
    ]);
    expect(res.score).toBeLessThan(50);
    expect(res.rating).toBe('Moroso');
    expect(res.color).toBe('red');
    expect(res.totalOverdue).toBe(80000);
  });
});

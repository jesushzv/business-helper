import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HealthScoreMeter } from '@/components/clients/HealthScoreMeter';
import { calculateClientHealthScore } from '@/lib/clientHealthScore';

/**
 * #108 — the meter sits on the surface where the owner decides whether to
 * extend credit, so:
 * - a score derived from real payment history must beat the stored column
 *   (the old precedence silently computed one number and displayed another);
 * - a client the app knows nothing about must render "Sin historial", never
 *   100 "Excelente".
 */

const LATE_MILESTONES = [
  {
    id: 'm-1',
    label: 'Anticipo',
    amount: 10000,
    status: 'pending',
    due_date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

describe('HealthScoreMeter (#108)', () => {
  it('renders "Sin historial" when neither score nor milestones carry signal', () => {
    render(<HealthScoreMeter />);
    expect(screen.getByText(/Sin historial/i)).toBeTruthy();
    expect(screen.queryByText(/Excelente/)).toBeNull();
    expect(screen.queryByText(/100/)).toBeNull();
  });

  it('renders "Sin historial" compactly too', () => {
    render(<HealthScoreMeter compact />);
    expect(screen.getByText(/Sin historial/i)).toBeTruthy();
  });

  it('prefers the milestone-derived score over the stored prop', () => {
    const derived = calculateClientHealthScore(LATE_MILESTONES);
    // The fixture is >30 days overdue; if this ever computes 100 the fixture
    // stopped exercising the precedence and the test must fail loudly.
    expect(derived.score).toBeLessThan(100);

    render(<HealthScoreMeter score={100} milestones={LATE_MILESTONES} />);
    expect(screen.getByText(String(derived.score))).toBeTruthy();
    expect(screen.queryByText(/Excelente/)).toBeNull();
  });

  it('falls back to the stored score when no milestones are provided', () => {
    render(<HealthScoreMeter score={82} compact />);
    expect(screen.getByText(/82\/100/)).toBeTruthy();
  });

  it('treats provided-but-empty milestones as no history, not as perfection', () => {
    render(<HealthScoreMeter milestones={[]} />);
    expect(screen.getByText(/Sin historial/i)).toBeTruthy();
  });
});

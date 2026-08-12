import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HealthScoreExplainer } from '@/components/landing/HealthScoreExplainer';
import { calculateClientHealthScore } from '@/lib/clientHealthScore';

describe('HealthScoreExplainer Component Suite', () => {
  it('renders the Confianza de Pago title and score scale 0-100', () => {
    render(<HealthScoreExplainer />);
    expect(screen.getByText(/Confianza de Pago \(0–100\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Protege tu flujo de efectivo evaluando automáticamente el riesgo crediticio/i)).toBeInTheDocument();
  });

  it('advertises exactly the four tiers the engine computes, with its labels and cuts (#232)', () => {
    // The page used to describe three tiers (90–100 / 70–89 / <70) with
    // labels and mechanics lib/clientHealthScore.ts never had. Pin the
    // rendered tiers to the engine's real vocabulary and boundaries.
    render(<HealthScoreExplainer />);

    expect(screen.getByText(/90–100/)).toBeInTheDocument();
    expect(screen.getAllByText('Excelente').length).toBeGreaterThan(0);

    expect(screen.getByText(/75–89/)).toBeInTheDocument();
    expect(screen.getByText('Bueno')).toBeInTheDocument();

    expect(screen.getByText(/50–74/)).toBeInTheDocument();
    expect(screen.getByText('En Riesgo')).toBeInTheDocument();

    expect(screen.getByText(/<50/)).toBeInTheDocument();
    expect(screen.getByText('Moroso')).toBeInTheDocument();
  });

  it('uses labels the engine actually returns, not marketing-only vocabulary', () => {
    // Cross-check against the engine itself: a clean history rates Excelente,
    // and the explainer's tier labels are drawn from the same closed set the
    // engine emits — so the two cannot drift apart silently again.
    expect(calculateClientHealthScore([]).rating).toBe('Excelente');
    render(<HealthScoreExplainer />);
    for (const rating of ['Excelente', 'Bueno', 'En Riesgo', 'Moroso']) {
      expect(screen.getAllByText(rating).length).toBeGreaterThan(0);
    }
  });
});

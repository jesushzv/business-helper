import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HealthScoreExplainer } from '@/components/landing/HealthScoreExplainer';

describe('HealthScoreExplainer Component Suite', () => {
  it('renders health score explainer title and score scale 0-100', () => {
    render(<HealthScoreExplainer />);
    expect(screen.getByText(/Score de Salud del Cliente \(0–100\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Protege tu flujo de efectivo evaluando automáticamente el riesgo crediticio/i)).toBeInTheDocument();
  });

  it('displays the three credit risk tiers (Excelente, Regular, Riesgo) with recommended actions', () => {
    render(<HealthScoreExplainer />);
    expect(screen.getByText(/90–100/i)).toBeInTheDocument();
    expect(screen.getByText('Cliente de Alto Valor')).toBeInTheDocument();

    expect(screen.getByText(/70–89/i)).toBeInTheDocument();
    expect(screen.getByText('Riesgo Moderado')).toBeInTheDocument();

    expect(screen.getByText(/<70/i)).toBeInTheDocument();
    expect(screen.getByText('Riesgo Severo')).toBeInTheDocument();
  });
});

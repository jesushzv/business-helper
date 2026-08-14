import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoiCalculator } from '@/components/landing/RoiCalculator';

describe('RoiCalculator Component & Steppers Suite', () => {
  it('renders ROI calculator title and default values', () => {
    render(<RoiCalculator />);
    expect(screen.getByText('¿Cuánto tiempo y dinero ahorrarás?')).toBeInTheDocument();
    expect(screen.getByText('30 cotizaciones')).toBeInTheDocument();
  });

  it('provides stepper buttons for quotes per month on mobile with min-h-[48px] touch targets', () => {
    render(<RoiCalculator />);
    const decrementBtn = screen.getByRole('button', { name: /Disminuir cotizaciones/i });
    const incrementBtn = screen.getByRole('button', { name: /Aumentar cotizaciones/i });

    expect(decrementBtn).toBeInTheDocument();
    expect(incrementBtn).toBeInTheDocument();
    expect(decrementBtn.className).toContain('min-h-[48px]');
    expect(incrementBtn.className).toContain('min-h-[48px]');

    fireEvent.click(incrementBtn);
    expect(screen.getByText('35 cotizaciones')).toBeInTheDocument();

    fireEvent.click(decrementBtn);
    expect(screen.getByText('30 cotizaciones')).toBeInTheDocument();
  });

  it('provides stepper buttons for quote value on mobile with min-h-[48px] touch targets', () => {
    render(<RoiCalculator />);
    const decrementValueBtn = screen.getByRole('button', { name: /Disminuir valor promedio/i });
    const incrementValueBtn = screen.getByRole('button', { name: /Aumentar valor promedio/i });

    expect(decrementValueBtn).toBeInTheDocument();
    expect(incrementValueBtn).toBeInTheDocument();
    expect(decrementValueBtn.className).toContain('min-h-[48px]');
    expect(incrementValueBtn.className).toContain('min-h-[48px]');

    fireEvent.click(incrementValueBtn);
    expect(screen.getAllByText(/\$30,000 MXN/i).length).toBeGreaterThan(0);

    fireEvent.click(decrementValueBtn);
    expect(screen.getAllByText(/\$25,000 MXN/i).length).toBeGreaterThan(0);
  });

  it('updates financial outputs when values change via steppers', () => {
    render(<RoiCalculator />);
    const incrementBtn = screen.getByRole('button', { name: /Aumentar cotizaciones/i });

    // Initial state: 30 quotes -> 10 hrs
    expect(screen.getByText('10 hrs')).toBeInTheDocument();

    // Increment quotes from 30 to 60 (6 clicks of step 5)
    for (let i = 0; i < 6; i++) {
      fireEvent.click(incrementBtn);
    }

    // 60 quotes * 0.33 = 20 hrs
    expect(screen.getByText('20 hrs')).toBeInTheDocument();
  });

  it('pluralizes the days-saved copy from the rendered component', () => {
    // The retired p1AuditFixes suite asserted a copy of this formula defined
    // inside the test file, which could never turn red when the component
    // changed. These assertions read the real render instead.
    render(<RoiCalculator />);

    // Default state: 10 hrs -> max(1, round(10/8)) = 1 day, singular.
    expect(screen.getByText(/Equivalente a 1 día laborable completo dedicado /)).toBeInTheDocument();

    // 60 quotes -> 20 hrs -> round(20/8) = 3 days, plural.
    const incrementBtn = screen.getByRole('button', { name: /Aumentar cotizaciones/i });
    for (let i = 0; i < 6; i++) {
      fireEvent.click(incrementBtn);
    }
    expect(
      screen.getByText(/Equivalente a 3 días laborables completos dedicados /)
    ).toBeInTheDocument();
  });
});

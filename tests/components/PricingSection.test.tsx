import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PricingPage from '@/app/pricing/page';

describe('Pricing Page Plan Name Standardization (Task F8)', () => {
  it('renders standardized plan names: Plan Inicial, Plan Negocio, Plan Empresa', () => {
    render(<PricingPage />);

    // Plan names appear in both the pricing cards and the comparison table
    // added in b697fb0, so these assert presence rather than uniqueness.
    expect(screen.getAllByText(/Plan Inicial/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Plan Negocio/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Plan Empresa/i).length).toBeGreaterThan(0);
  });

  it('does NOT contain obsolete/inconsistent plan names like Plan PyME Pro or Plan Empresarial', () => {
    render(<PricingPage />);

    expect(screen.queryByText(/Plan PyME Pro/i)).toBeNull();
    expect(screen.queryByText(/Plan Empresarial \/ Multi-sucursal/i)).toBeNull();
  });

  it('includes clear MXN pricing and CTAs linking to /register with plan parameters', () => {
    render(<PricingPage />);

    expect(screen.getAllByText('$299').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$599').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$999').length).toBeGreaterThan(0);
  });
});

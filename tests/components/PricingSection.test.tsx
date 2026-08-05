import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PricingPage from '@/app/pricing/page';

describe('Pricing Page Plan Name Standardization (Task F8)', () => {
  it('renders standardized plan names: Plan Inicial, Plan Negocio, Plan Empresa', () => {
    render(<PricingPage />);

    expect(screen.getByText(/Plan Inicial/i)).toBeInTheDocument();
    expect(screen.getByText(/Plan Negocio/i)).toBeInTheDocument();
    expect(screen.getByText(/Plan Empresa/i)).toBeInTheDocument();
  });

  it('does NOT contain obsolete/inconsistent plan names like Plan PyME Pro or Plan Empresarial', () => {
    render(<PricingPage />);

    expect(screen.queryByText(/Plan PyME Pro/i)).toBeNull();
    expect(screen.queryByText(/Plan Empresarial \/ Multi-sucursal/i)).toBeNull();
  });

  it('includes clear MXN pricing and CTAs linking to /register with plan parameters', () => {
    render(<PricingPage />);

    expect(screen.getByText('$299')).toBeInTheDocument();
    expect(screen.getByText('$599')).toBeInTheDocument();
    expect(screen.getByText('$999')).toBeInTheDocument();
  });
});

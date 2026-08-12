import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComparisonSection } from '@/components/landing/ComparisonSection';

// The section renders a desktop table and a mobile card list, so most labels
// legitimately appear twice. getByText throws on multiple matches; these
// assertions check presence, not uniqueness.
describe('ComparisonSection Component Suite', () => {
  it('renders comparison section title and competitor headers', () => {
    render(<ComparisonSection />);
    expect(screen.getByText(/¿Por qué las PyMEs eligen Business Helper?/i)).toBeInTheDocument();
    expect(screen.getAllByText('Business Helper').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Excel \/ WhatsApp Manual/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sistemas Tradicionales/i).length).toBeGreaterThan(0);
  });

  it('renders side-by-side metric comparison rows with accurate attributes', () => {
    render(<ComparisonSection />);
    expect(screen.getAllByText('Tiempo por Cotización').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Firma Legal & Aceptación OTP').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Confianza de Pago/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Timbrado CFDI 4.0 PAC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Precio & Modelo de Licencia').length).toBeGreaterThan(0);
  });
});

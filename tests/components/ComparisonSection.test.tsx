import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComparisonSection } from '@/components/landing/ComparisonSection';

describe('ComparisonSection Component Suite', () => {
  it('renders comparison section title and competitor headers', () => {
    render(<ComparisonSection />);
    expect(screen.getByText(/¿Por qué las PyMEs eligen Business Helper?/i)).toBeInTheDocument();
    expect(screen.getByText('Business Helper')).toBeInTheDocument();
    expect(screen.getByText(/Excel \/ WhatsApp Manual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sistemas Tradicionales/i).length).toBeGreaterThan(0);
  });

  it('renders side-by-side metric comparison rows with accurate attributes', () => {
    render(<ComparisonSection />);
    expect(screen.getByText('Tiempo por Cotización')).toBeInTheDocument();
    expect(screen.getByText('Firma Legal & Aceptación OTP')).toBeInTheDocument();
    expect(screen.getByText(/Score de Salud del Cliente/i)).toBeInTheDocument();
    expect(screen.getByText('Timbrado CFDI 4.0 PAC')).toBeInTheDocument();
    expect(screen.getByText('Precio & Modelo de Licencia')).toBeInTheDocument();
  });
});

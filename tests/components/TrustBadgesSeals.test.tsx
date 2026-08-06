import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TrustBadges } from '@/components/landing/TrustBadges';
import { TRUST_BADGES } from '@/lib/trustData';

describe('Task A4: Replace Self-Issued Badges with External PAC/SSL/Stripe Seals Suite', () => {
  it('does NOT contain defensive self-issued text "Verificado en Producción"', () => {
    const { container } = render(<TrustBadges />);
    expect(container.textContent).not.toContain('Verificado en Producción');
  });

  it('renders official external trust seals for Facturapi PAC, Stripe SSL, and Banxico SPEI', () => {
    render(<TrustBadges />);
    expect(screen.getByText(/PAC SAT Certificado|Facturapi Partner/i)).toBeInTheDocument();
    expect(screen.getByText(/Cifrado TLS 1\.3|Stripe \(PCI DSS/i)).toBeInTheDocument();
    expect(screen.getByText(/Verificación CEP Banxico/i)).toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PricingPage from '@/app/pricing/page';
import DemoPage from '@/app/demo/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('Task E8 & Landing Remediation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders /pricing page with pricing plans and H1 title cleanly', () => {
    render(<PricingPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Elige el plan ideal/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Plan Inicial/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Plan Negocio/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Plan Empresa/i })).toBeInTheDocument();
  });

  it('renders /demo page with interactive sandbox preview and H1 title cleanly', () => {
    render(<DemoPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Prueba la plataforma en vivo/i })).toBeInTheDocument();
    expect(screen.getByText(/Sandbox Interactivo en Vivo/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Explorar Sandbox Interactivo/i })[0]).toHaveAttribute(
      'href',
      '/dashboard?demo=true'
    );
  });
});

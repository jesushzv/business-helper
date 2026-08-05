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
    expect(screen.getByRole('heading', { level: 2, name: /Plan Emprendedor/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Plan PyME Pro/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Plan Empresarial/i })).toBeInTheDocument();
  });

  it('renders /demo page with interactive video player and H1 title cleanly', () => {
    render(<DemoPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Descubre cómo cotizar y cobrar/i })).toBeInTheDocument();
    expect(screen.getByText(/Demostración en Vivo/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explorar Panel Interactivo Demo/i })).toHaveAttribute(
      'href',
      '/dashboard?demo=true'
    );
  });
});

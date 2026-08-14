import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PricingPage from '@/app/pricing/page';
import DemoPage from '@/app/demo/page';
import LandingPage from '@/app/page';

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
    expect(screen.getByText(/Demostración Interactiva en Vivo/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Explorar la Demostración/i })[0]).toHaveAttribute(
      'href',
      '/dashboard?demo=true'
    );
  });

  /**
   * `/demo` sat in the sitemap at priority 0.8 with no inbound link anywhere a
   * crawler could follow: the nav's demo slot and the hero CTA both pointed at
   * `/dashboard?demo=true`, so the sitemap advertised a page the site itself
   * would not reach (#338).
   *
   * The split this pins: the *nav* reaches the explanatory page (what a cold
   * visitor from search wants), the *hero CTA* reaches the sandbox (what
   * someone already convinced wants). Collapsing them either way re-orphans
   * `/demo` or drags the convinced visitor onto a second explanation.
   *
   * `/pricing` is the same orphan shape one priority higher, but resolving it
   * means choosing which of two overlapping pricing surfaces is canonical —
   * filed as a decision in #349 rather than answered here.
   */
  describe('#338 — the marketing pages the sitemap advertises are reachable', () => {
    it('splits the two "Ver Demo" slots: nav → /demo, hero CTA → the sandbox', () => {
      render(<LandingPage />);

      const demoLinks = screen
        .getAllByRole('link', { name: /^Ver Demo$/i })
        .map((link) => link.getAttribute('href'));

      // Both slots exist and they point at different things. Asserting the
      // exact set fails whether the nav regresses to the sandbox or the hero
      // CTA is dragged onto the explanatory page.
      expect(new Set(demoLinks)).toEqual(new Set(['/demo', '/dashboard?demo=true']));
      expect(demoLinks).toHaveLength(2);
    });
  });
});

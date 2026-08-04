import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StickyMobileCta } from '@/components/landing/StickyMobileCta';

describe('StickyMobileCta Component Suite', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('initially stays hidden when scrollY is less than 300px', () => {
    render(<StickyMobileCta />);
    const ctaLink = screen.queryByRole('link', { name: /Probar 14 Días Gratis/i });
    expect(ctaLink).not.toBeInTheDocument();
  });

  it('becomes visible when window scrollY exceeds 300px', () => {
    render(<StickyMobileCta />);
    window.scrollY = 350;
    fireEvent.scroll(window);

    const ctaLink = screen.getByRole('link', { name: /Probar 14 Días Gratis/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/onboarding');
  });

  it('enforces Don Roberto persona constraint: touch target min-h-[48px] on CTA button', () => {
    render(<StickyMobileCta />);
    window.scrollY = 400;
    fireEvent.scroll(window);

    const ctaLink = screen.getByRole('link', { name: /Probar 14 Días Gratis/i });
    expect(ctaLink.className).toContain('min-h-[48px]');
  });
});

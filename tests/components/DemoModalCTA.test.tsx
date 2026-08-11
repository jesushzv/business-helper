import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LiveDemoButton } from '@/components/landing/LiveDemoButton';

describe('LiveDemoButton Suite', () => {
  it('renders LiveDemoButton and links directly to demo dashboard app', () => {
    render(<LiveDemoButton />);
    // Relabelled again for #103: "Sandbox" is developer vocabulary for the
    // public demo, replaced consistently across LiveDemoButton and Footer.
    // The destination is what matters here.
    const link = screen.getByRole('link', { name: /Explorar la Demostración/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard?demo=true');
  });
});


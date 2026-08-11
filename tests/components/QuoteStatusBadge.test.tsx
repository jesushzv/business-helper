import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuoteStatusBadge } from '@/components/quotes/QuoteStatusBadge';

describe('QuoteStatusBadge Component Suite', () => {
  it('renders correct labels and styles for all quote statuses', () => {
    const { rerender } = render(<QuoteStatusBadge status="draft" />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();

    rerender(<QuoteStatusBadge status="sent" />);
    expect(screen.getByText('Enviada')).toBeInTheDocument();

    rerender(<QuoteStatusBadge status="accepted" />);
    expect(screen.getByText('Aceptada')).toBeInTheDocument();

    rerender(<QuoteStatusBadge status="rejected" />);
    expect(screen.getByText('Rechazada')).toBeInTheDocument();

    rerender(<QuoteStatusBadge status="expired" />);
    expect(screen.getByText('Vencida')).toBeInTheDocument();

    rerender(<QuoteStatusBadge status="converted" />);
    expect(screen.getByText('Convertida a Contrato')).toBeInTheDocument();

    // This asserted that an unmapped status renders its raw English enum —
    // the defect #103 §3 names, pinned in place by its own test.
    rerender(<QuoteStatusBadge status="unknown_status" />);
    expect(screen.queryByText('unknown_status')).toBeNull();
    expect(screen.getByText('Sin estado')).toBeInTheDocument();
  });
});

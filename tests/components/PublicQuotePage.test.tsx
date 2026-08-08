import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PublicQuotePage from '@/app/q/[token]/page';

/**
 * The public signing page must render the quote the token points at.
 *
 * Until this suite existed, the page never called the public API: it rendered
 * one hardcoded demo quote — title, line items, totals — for ANY token, while
 * the OTP modal signed the real row underneath. The client reviewed fabricated
 * figures and signed something else.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'real-token-123' }),
}));

const REAL_QUOTE = {
  id: 'aabbccdd-1122',
  title: 'Impermeabilización de Techos Zona Norte',
  line_items: [{ description: 'Aplicación impermeabilizante', quantity: 200, unit_price: 180 }],
  subtotal_amount: 36000,
  iva_amount: 5760,
  retencion_isr_amount: 0,
  retencion_iva_amount: 0,
  total_amount: 41760,
  currency: 'MXN',
  status: 'sent',
  valid_until: '2026-09-15',
  notes: 'Garantía de 5 años.',
  public_token: 'real-token-123',
  contract_hash: null,
  accepted_at: null,
  clients: { name: 'Inmobiliaria del Golfo', contact_name: 'Lic. Andrea Sada' },
  organizations: { name: 'Impermeabilizantes Cavazos', logo_url: null },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicQuotePage (/q/[token])', () => {
  it('renders the fetched quote, not the hardcoded demo fixture', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, REAL_QUOTE));

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByText('Impermeabilización de Techos Zona Norte')).toBeInTheDocument()
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/quotes/public/real-token-123');
    // Vendor branding and client identity come from the row, not fixtures.
    expect(screen.getByText('Impermeabilizantes Cavazos')).toBeInTheDocument();
    expect(screen.getByText('Inmobiliaria del Golfo')).toBeInTheDocument();
    // The old fixture must be gone in every trace.
    expect(document.body.innerHTML).not.toContain('Suministro de Materiales de Obra');
    expect(document.body.innerHTML).not.toContain('Construcciones Maya');
    expect(document.body.innerHTML).not.toContain('8115551234');
  });

  it('shows "no encontrada" for a token the server does not recognize', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: 'QUOTE_NOT_FOUND', message: 'Cotización no encontrada' } })
    );

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByText(/Cotización no encontrada/i)).toBeInTheDocument()
    );
  });

  it('shows a load error, not a demo quote, when the server fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'QUOTE_FETCH_FAILED', message: 'boom' } })
    );

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByText(/No se pudo cargar la cotización/i)).toBeInTheDocument()
    );
    expect(document.body.innerHTML).not.toContain('Suministro de Materiales de Obra');
  });

  it('renders the signed state instead of the sign button when the quote is already sealed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...REAL_QUOTE,
        status: 'accepted',
        contract_hash: 'sealed-hash-abc',
        accepted_at: '2026-08-05T12:00:00Z',
      })
    );

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByText(/Propuesta Aceptada y Firmada/i)).toBeInTheDocument()
    );
    expect(screen.getByText('sealed-hash-abc')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceptar y Firmar/i })).toBeNull();
  });
});

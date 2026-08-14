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
  // Dynamic: the page now enforces expiry (#258), so a hardcoded date would
  // have every case below start failing the day it passes.
  valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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

  it('offers "Solicitar Cambios" only when the vendor has a WhatsApp on record, aimed at that number (#44)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...REAL_QUOTE,
        organizations: { ...REAL_QUOTE.organizations, phone: '8187654321' },
      })
    );
    render(<PublicQuotePage />);

    const button = await screen.findByText(/Solicitar Cambios por WhatsApp/i);
    const link = button.closest('a');
    expect(link?.getAttribute('href')).toContain('wa.me/528187654321');
    // The hardcoded number every tenant's clients used to be routed to.
    expect(link?.getAttribute('href')).not.toContain('8115551234');
  });

  it('renders no change-request button at all when the vendor has no phone — absent is absent (#44)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, REAL_QUOTE));
    render(<PublicQuotePage />);

    await screen.findByText(/Aceptar y Firmar/i);
    expect(screen.queryByText(/Solicitar Cambios/i)).toBeNull();
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

/**
 * #282 — the page's only branch was "sealed or sign button", so a converted,
 * rejected or draft quote showed a live "Aceptar y Firmar" whose OTP request
 * the server always refuses: a wall mid-flow, on a link the tenant sent. And
 * with expiry now enforced server-side (#258), an expired quote needs the same
 * treatment — the button would dead-end identically.
 */
describe('a quote that cannot be signed does not offer to be', () => {
  it.each([
    ['converted', /ya se convirtió en contrato/i],
    ['rejected', /fue rechazada/i],
    ['draft', /todavía no está lista para firma/i],
  ])('renders the %s state plainly, with no sign button', async (status, copy) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...REAL_QUOTE, status }));

    render(<PublicQuotePage />);

    await waitFor(() => expect(screen.getByText(copy)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Aceptar y Firmar/i })).toBeNull();
  });

  it('renders the expired state for a quote past its valid_until (#258)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...REAL_QUOTE, valid_until: '2026-08-01' })
    );

    render(<PublicQuotePage />);

    await waitFor(() => expect(screen.getByText(/ya venció/i)).toBeInTheDocument());
    // Names the date and the way forward. Scoped: the header's "Válida hasta"
    // line also carries the date.
    expect(screen.getByText(/Era válida hasta el 2026-08-01/i)).toBeInTheDocument();
    expect(screen.getByText(/cotización actualizada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aceptar y Firmar/i })).toBeNull();
  });

  it('still offers WhatsApp contact on a non-signable quote when the org has a phone', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...REAL_QUOTE,
        valid_until: '2026-08-01',
        organizations: { ...REAL_QUOTE.organizations, phone: '+528112345678' },
      })
    );

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Contactar al negocio/i })).toBeInTheDocument()
    );
  });

  it('shows a signed quote as signed even after its window closed', async () => {
    // The signature already happened; "venció" would be false news.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...REAL_QUOTE,
        status: 'accepted',
        valid_until: '2026-08-01',
        contract_hash: 'sealed-hash-abc',
      })
    );

    render(<PublicQuotePage />);

    await waitFor(() =>
      expect(screen.getByText(/Propuesta Aceptada y Firmada/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/ya venció/i)).toBeNull();
  });
});

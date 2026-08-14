import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ReceivablesPage from '@/app/(dashboard)/receivables/page';
import QuotesPage from '@/app/(dashboard)/quotes/page';
import { __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';

/**
 * #97 — a failed read must render as a failure, never as a reassuring empty
 * state. The receivables page told an owner with an errored fetch "Todas tus
 * cuentas por cobrar están al día" — a factual claim about money made while
 * the hook held an error saying it didn't know — and the quotes page greeted
 * them with the create-your-first-quote CTA.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

/** Every API fails; the pages must say so instead of reassuring. */
function failAllApis() {
  fetchMock.mockImplementation(async () =>
    jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Error interno' } })
  );
}

/** Every API answers empty — the genuine all-clear. */
function emptyAllApis() {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/receivables')) return jsonResponse(200, { receivables: [] });
    if (url.startsWith('/api/quotes')) return jsonResponse(200, { quotes: [] });
    if (url.startsWith('/api/clients')) return jsonResponse(200, { clients: [] });
    if (url.startsWith('/api/organization')) {
      return jsonResponse(200, { organization: { id: 'org-1', name: 'X' }, role: 'owner' });
    }
    return jsonResponse(200, {});
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Without this the Vitest default (no NEXT_PUBLIC_SUPABASE_URL) reads as
  // demo mode and every real-tenant branch below silently asserts nothing.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('receivables page (#97)', () => {
  it('renders an error state on a failed fetch — never "todas tus cuentas están al día"', async () => {
    failAllApis();
    render(<ReceivablesPage />);

    expect(await screen.findByText(/No pudimos cargar tu cobranza/i)).toBeTruthy();
    expect(screen.queryByText(/al día/i)).toBeNull();
  });

  it('keeps the genuine empty state for a tenant whose receivables really are empty', async () => {
    emptyAllApis();
    render(<ReceivablesPage />);

    // #104 split this from the filtered case: with no filter active, the
    // tenant is told they have none *yet* and given a route onward, rather
    // than "no hay cobros en este filtro" when no filter is applied.
    expect(await screen.findByText(/Todavía no tienes cobros registrados/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ir a Cotizaciones/i })).toBeTruthy();
    expect(screen.queryByText(/No pudimos cargar/i)).toBeNull();
  });
});

describe('quotes page (#97)', () => {
  it('renders an error state on a failed fetch — never the first-quote CTA', async () => {
    failAllApis();
    render(<QuotesPage />);

    expect(await screen.findByText(/No pudimos cargar tus cotizaciones/i)).toBeTruthy();
    expect(screen.queryByText(/Comienza creando tu primera propuesta/i)).toBeNull();
  });

  it('keeps the genuine empty state for a tenant with zero quotes', async () => {
    emptyAllApis();
    render(<QuotesPage />);

    expect(await screen.findByText(/Todavía no tienes cotizaciones/i)).toBeTruthy();
    // The create CTA belongs to a genuinely empty list (#104). Two match —
    // the page header's and the empty state's — which is the point: neither
    // should vanish when the list is truly empty.
    expect(screen.getAllByRole('button', { name: /Nueva Cotización/i }).length).toBeGreaterThan(1);
    expect(screen.queryByText(/No pudimos cargar/i)).toBeNull();
  });
});

/**
 * #260 — the #97 class, finished. Five more surfaces collapsed a failed read
 * into "you have nothing"; each case below plants the failure and asserts the
 * screen refuses to claim an empty book of business.
 */
describe('clients directory (#260)', () => {
  it('renders an error state on a failed fetch — never "Registra a tu primer cliente"', async () => {
    failAllApis();
    const { default: ClientsPage } = await import('@/app/(dashboard)/clients/page');
    render(<ClientsPage />);

    expect(await screen.findByText(/No pudimos cargar tu directorio/i)).toBeTruthy();
    // The CTA whose worst case is re-registering an existing client.
    expect(screen.queryByText(/Registrar Cliente Ahora/i)).toBeNull();
    expect(screen.queryByText(/No se encontraron clientes/i)).toBeNull();
    // And no "0 Clientes / 0 Excelente" tiles asserting figures off the failure.
    expect(screen.queryByText(/0 Clientes/i)).toBeNull();
  });

  it('keeps the genuine empty state for a tenant with zero clients', async () => {
    emptyAllApis();
    const { default: ClientsPage } = await import('@/app/(dashboard)/clients/page');
    render(<ClientsPage />);

    expect(await screen.findByText(/No se encontraron clientes/i)).toBeTruthy();
    expect(screen.getByText(/Registrar Cliente Ahora/i)).toBeTruthy();
    expect(screen.queryByText(/No pudimos cargar tu directorio/i)).toBeNull();
  });
});

describe('quotes page KPI tiles and the clients join (#260)', () => {
  it('withholds the KPI figures while the read has failed', async () => {
    failAllApis();
    render(<QuotesPage />);

    await screen.findByText(/No pudimos cargar tus cotizaciones/i);
    // "Enviadas 0 / $0.00" beside an error panel is a claim, not a placeholder.
    expect(screen.queryByText('$0.00')).toBeNull();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('warns when the clients half of the join failed while quotes loaded', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/clients')) {
        return jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Error interno' } });
      }
      if (url.startsWith('/api/quotes')) {
        return jsonResponse(200, {
          quotes: [
            {
              id: 'q-1',
              client_id: 'c-1',
              title: 'Bardas Perimetrales',
              status: 'sent',
              total_amount: 12000,
              line_items: [],
              public_token: 'tok-1',
              created_at: '2026-08-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.startsWith('/api/organization')) {
        return jsonResponse(200, { organization: { id: 'org-1', name: 'X' }, role: 'owner' });
      }
      return jsonResponse(200, {});
    });
    render(<QuotesPage />);

    await screen.findByText('Bardas Perimetrales');
    // The quotes render; the missing names are announced instead of every card
    // silently reading "Cliente sin asignar".
    expect(
      screen.getByText(/No pudimos cargar tu directorio de clientes/i)
    ).toBeTruthy();
  });
});

describe('facturación list (#260)', () => {
  it('says the read failed instead of "Aún no tienes cobros registrados"', async () => {
    failAllApis();
    const { InvoiceManagerCard } = await import('@/components/invoices/InvoiceManagerCard');
    render(<InvoiceManagerCard />);

    expect(await screen.findByText(/No pudimos cargar tus cobros/i)).toBeTruthy();
    expect(screen.queryByText(/Aún no tienes cobros registrados/i)).toBeNull();
  });
});

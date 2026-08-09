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

    expect(await screen.findByText(/No hay cobros en este filtro/i)).toBeTruthy();
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

    expect(await screen.findByText(/No se encontraron cotizaciones/i)).toBeTruthy();
    expect(screen.queryByText(/No pudimos cargar/i)).toBeNull();
  });
});

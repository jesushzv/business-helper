import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { foldSearchText } from '@/lib/search';
import { useClients } from '@/lib/hooks/useClients';
import { useProducts } from '@/lib/hooks/useProducts';

/**
 * #278 — search must be accent-insensitive in the directories.
 *
 * Mexican Spanish names carry accents the tenant rarely types (a long-press on
 * mobile keyboards), so "ferreteria" not finding "Ferretería" answered "No se
 * encontraron clientes" — and the empty state then offered to register the
 * client again. Both hooks and the quotes filter fold through lib/search.ts.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('foldSearchText', () => {
  it('strips accents and case so both sides compare equal', () => {
    expect(foldSearchText('Ferretería')).toBe('ferreteria');
    expect(foldSearchText('Instalación de Tablaroca')).toBe('instalacion de tablaroca');
    expect(foldSearchText('PEÑA')).toBe('pena');
    expect(foldSearchText(null)).toBe('');
    expect(foldSearchText(undefined)).toBe('');
  });
});

describe('clients directory search (#278)', () => {
  const CLIENT = {
    id: 'c-1',
    organization_id: 'org-1',
    name: 'Ferretería La Central',
    contact_name: 'Ing. Peña',
    email: null,
    phone: '4771234567',
    rfc: 'FLC050505XX1',
    health_score: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };

  it('finds "Ferretería" when the owner types "ferreteria"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { clients: [CLIENT] }));
    const { result } = renderHook(() => useClients());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSearchQuery('ferreteria'));
    expect(result.current.filteredClients).toHaveLength(1);

    // The accented query finds the row too — folding is applied to both sides.
    act(() => result.current.setSearchQuery('peña'));
    expect(result.current.filteredClients).toHaveLength(1);

    act(() => result.current.setSearchQuery('tlapalería'));
    expect(result.current.filteredClients).toHaveLength(0);
  });
});

describe('products directory search (#278)', () => {
  const PRODUCT = {
    id: 'p-1',
    organization_id: 'org-1',
    name: 'Instalación de Tablaroca',
    description: 'Colocación y acabado',
    unit_price: 950,
    unit: 'E48',
    sat_product_code: '72131702',
    stock_quantity: null,
  };

  it('finds "Instalación" when the owner types "instalacion"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [PRODUCT] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSearchTerm('instalacion'));
    expect(result.current.products).toHaveLength(1);

    act(() => result.current.setSearchTerm('colocacion'));
    expect(result.current.products).toHaveLength(1);

    act(() => result.current.setSearchTerm('impermeabilizante'));
    expect(result.current.products).toHaveLength(0);
  });
});

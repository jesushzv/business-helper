import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProducts } from '@/lib/hooks/useProducts';

/**
 * #98 — the catalog must live on the server for real tenants.
 *
 * The old hook read and wrote only localStorage: every tenant started with
 * four demo products presented as their own, the catalog vanished on device
 * change, and /api/products had zero callers. localStorage is the demo
 * sandbox, nothing else.
 */

const SERVER_PRODUCT = {
  id: 'p-real-1',
  organization_id: 'org-1',
  name: 'Instalación de Tablaroca',
  description: null,
  unit_price: 950,
  unit: 'E48',
  sat_product_code: '72131702',
  stock_quantity: null,
};

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

describe('read honesty (real tenant)', () => {
  it('serves the server catalog and an empty list as a real answer — never the demo seed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allProducts).toEqual([]);
    expect(result.current.error).toBeNull();
    // The old hook seeded these into every visitor's localStorage.
    expect(localStorage.getItem('business_helper_products_v1')).toBeNull();
  });

  it('surfaces a failed read as an error, not as demo products', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar los productos' } })
    );
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allProducts).toEqual([]);
    expect(result.current.error).toBe('No se pudieron cargar los productos');
  });
});

describe('mutation honesty (real tenant)', () => {
  it('adds via POST and applies the server row', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(jsonResponse(201, { product: SERVER_PRODUCT }));
    let outcome;
    await act(async () => {
      outcome = await result.current.addProduct({
        name: 'Instalación de Tablaroca',
        unit_price: 950,
        sat_product_code: '72131702',
      });
    });

    expect(outcome).toMatchObject({ success: true });
    // The server's id, not the locally minted prod-<timestamp>.
    expect(result.current.allProducts[0].id).toBe('p-real-1');
  });

  it('reports a rejected add as a failure and keeps the list unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar el producto' } })
    );
    let outcome;
    await act(async () => {
      outcome = await result.current.addProduct({ name: 'X', unit_price: 10 });
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.allProducts).toEqual([]);
    expect(result.current.error).toBe('No se pudo guardar el producto');
  });

  it('keeps the row when the DELETE fails — no fabricated removal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [SERVER_PRODUCT] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo eliminar el producto' } })
    );
    let outcome;
    await act(async () => {
      outcome = await result.current.deleteProduct('p-real-1');
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.allProducts).toHaveLength(1);
  });

  it('removes the row after a confirmed DELETE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [SERVER_PRODUCT] }));
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { deleted: true }));
    await act(async () => {
      await result.current.deleteProduct('p-real-1');
    });

    expect(result.current.allProducts).toEqual([]);
  });
});

describe('legacy localStorage rows (the migration note in #98)', () => {
  it('offers this browser’s pre-server rows for import instead of discarding them', async () => {
    const legacy = { ...SERVER_PRODUCT, id: 'prod-1700000000', name: 'Concepto guardado local' };
    localStorage.setItem('business_helper_products_v1', JSON.stringify([legacy]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.legacyLocalProducts).toHaveLength(1);
    expect(result.current.legacyLocalProducts[0].name).toBe('Concepto guardado local');
  });

  it('never offers the demo seed itself as a legacy import', async () => {
    const demoSeed = { ...SERVER_PRODUCT, id: 'prod-1', name: 'Servicios de Consultoría Operativa' };
    localStorage.setItem('business_helper_products_v1', JSON.stringify([demoSeed]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.legacyLocalProducts).toEqual([]);
  });
});

describe('demo deployment', () => {
  it('keeps the localStorage sandbox, only behind the demo signal', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allProducts.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

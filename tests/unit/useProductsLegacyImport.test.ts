import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProducts } from '@/lib/hooks/useProducts';

/**
 * #280 — a partially failed legacy import must strand nothing silently.
 *
 * The banner was offered only while the server list was empty, and the first
 * successful add cleared the offer — so a failure at row 4 of 12 left nine
 * rows invisible in localStorage forever, with nothing saying which nine.
 * Now the offer is keyed on "legacy rows remain on this browser", each row's
 * local copy is removed as its own upload lands, and a partial failure reports
 * how far it got.
 */

const LOCAL_KEY = 'business_helper_products_v1';

const legacyRow = (n: number) => ({
  id: `legacy-${n}`,
  name: `Producto legado ${n}`,
  description: null,
  unit_price: 100 * n,
  unit: 'E48',
  sat_product_code: '84111506',
  stock_quantity: null,
});

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

describe('the import offer survives a non-empty server catalog (#280)', () => {
  it('still offers stranded legacy rows when the server already has products', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([legacyRow(1), legacyRow(2)]));
    // One product already on the server — the old gate hid the offer here.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { products: [{ ...legacyRow(9), id: 'p-server-1' }] })
    );

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.legacyLocalProducts).toHaveLength(2);
  });
});

describe('a partial import failure (#280)', () => {
  it('keeps the unsent rows, reports how far it got, and the offer persists', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([legacyRow(1), legacyRow(2), legacyRow(3)]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.legacyLocalProducts).toHaveLength(3);

    // Row 1 uploads; row 2's POST fails; row 3 is never attempted.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { ...legacyRow(1), id: 'p-srv-1', organization_id: 'org-1' } })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar el producto.' } })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.importLegacyProducts();
    });

    expect(outcome).toMatchObject({ success: false });
    expect(outcome!.success === false && outcome!.error).toMatch(/1 de 3/);

    // The uploaded row left localStorage; the two unsent rows did not.
    const remaining = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    expect(remaining.map((p: { id: string }) => p.id)).toEqual(['legacy-2', 'legacy-3']);
    expect(result.current.legacyLocalProducts).toHaveLength(2);
  });

  it('an unrelated manual add no longer dismisses the offer', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([legacyRow(1)]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.legacyLocalProducts).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        product: { id: 'p-new', organization_id: 'org-1', name: 'Nuevo', unit_price: 10, unit: 'E48', sat_product_code: '84111506', stock_quantity: null },
      })
    );
    await act(async () => {
      await result.current.addProduct({ name: 'Nuevo', unit_price: 10 });
    });

    // The legacy row is still stranded on this browser; the offer must survive.
    expect(result.current.legacyLocalProducts).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).toHaveLength(1);
  });

  it('id-less legacy rows are removed one at a time, never all at once (DB review of #280)', async () => {
    // Rows saved by the oldest hook versions may lack ids; matching them with
    // `p.id === item.id` was `undefined === undefined` — true for every
    // id-less row, so the FIRST upload deleted ALL their local copies.
    const idless = (n: number) => ({ ...legacyRow(n), id: undefined });
    localStorage.setItem(LOCAL_KEY, JSON.stringify([idless(1), idless(2)]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Row 1 uploads; row 2's POST fails.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { ...legacyRow(1), id: 'p-srv-1', organization_id: 'org-1' } })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar el producto.' } })
    );

    await act(async () => {
      await result.current.importLegacyProducts();
    });

    // The unsent row survives on disk and stays offered.
    const remaining = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('Producto legado 2');
    expect(result.current.legacyLocalProducts).toHaveLength(1);
  });

  it('a fully successful import clears the local copy and the offer', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([legacyRow(1), legacyRow(2)]));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));

    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { ...legacyRow(1), id: 'p-srv-1', organization_id: 'org-1' } })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { ...legacyRow(2), id: 'p-srv-2', organization_id: 'org-1' } })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.importLegacyProducts();
    });

    expect(outcome).toMatchObject({ success: true });
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(result.current.legacyLocalProducts).toHaveLength(0);
  });
});

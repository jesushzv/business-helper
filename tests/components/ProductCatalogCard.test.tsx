import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProductCatalogCard } from '@/components/products/ProductCatalogCard';

/**
 * The product catalog (#149).
 *
 * Two of this repo's defect classes meet in this card. The catalog once offered
 * a delete that only touched localStorage, because no route implemented it
 * (#98) — a row the owner watched disappear and found again on reload. And the
 * add form writes `sat_product_code` and `unit`, the two fields a CFDI cannot
 * be stamped without: a product saved with the wrong ones invoices wrongly, and
 * nothing downstream says where it came from.
 *
 * So the cases here ask the owner's question — *is what I just saved, or just
 * deleted, what the server has?* — and they assert on the request, since a
 * catalog is only as good as the row behind it.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Impermeabilizante acrílico 19L',
    description: 'Cubeta blanca',
    unit_price: 1850,
    unit: 'H87',
    sat_product_code: '30161500',
    stock_quantity: 24,
  },
];

const openAdd = () => screen.getByRole('button', { name: /Nuevo Concepto/i });
const nameInput = () => screen.getByPlaceholderText(/Servicios de Consultoría/i) as HTMLInputElement;
const priceInput = () => screen.getByPlaceholderText('0.00') as HTMLInputElement;
const satInput = () => screen.getByPlaceholderText('84111506') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /Guardar en Catálogo/i });

async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: PRODUCTS }));
  render(<ProductCatalogCard />);
  await screen.findByText('Impermeabilizante acrílico 19L');
}

async function openForm() {
  await renderLoaded();
  fireEvent.click(openAdd());
  await waitFor(() => expect(nameInput()).toBeTruthy());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the catalog the tenant actually has', () => {
  it('lists what the API returned', async () => {
    await renderLoaded();
    expect(screen.getByText(/30161500/)).toBeTruthy();
  });

  it('does not fill an empty catalog with invented products', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    render(<ProductCatalogCard />);

    await waitFor(() => expect(screen.queryByText('Impermeabilizante acrílico 19L')).toBeNull());
    expect(screen.queryByText(/Servicios de Consultoría/i)).toBeNull();
  });
});

describe('adding a product', () => {
  it('saves the fields a CFDI needs, exactly as entered', async () => {
    await openForm();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { id: 'prod-2', name: 'Sellador de juntas' } })
    );

    fireEvent.change(nameInput(), { target: { value: 'Sellador de juntas' } });
    fireEvent.change(priceInput(), { target: { value: '420.50' } });
    fireEvent.change(satInput(), { target: { value: '30161600' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/products');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'Sellador de juntas',
      unit_price: 420.5,
      sat_product_code: '30161600',
      unit: 'E48',
    });
  });

  it('resets the clave and unidad after a save — the previous item must not pre-fill the next concept (#294)', async () => {
    await openForm();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { product: { id: 'prod-2', name: 'Cemento Tolteca' } })
    );

    const unitSelect = () => screen.getByLabelText(/Unidad SAT/i) as HTMLSelectElement;
    fireEvent.change(nameInput(), { target: { value: 'Cemento Tolteca' } });
    fireEvent.change(priceInput(), { target: { value: '235' } });
    fireEvent.change(satInput(), { target: { value: '30111601' } });
    fireEvent.change(unitSelect(), { target: { value: 'H87' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    // The success branch used to reset name/price but keep clave and unidad,
    // so the cement pair sat pre-filled — already "filled", nothing prompting a
    // change — and rode into the next concept's CFDI at stamping.
    await waitFor(() => expect(satInput().value).toBe('84111506'));
    expect(unitSelect().value).toBe('E48');
  });

  it('does not report a save the server refused', async () => {
    await openForm();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: { code: 'INVALID_INPUT', message: 'La clave SAT debe tener 8 dígitos.' },
      })
    );

    fireEvent.change(nameInput(), { target: { value: 'Sellador de juntas' } });
    fireEvent.change(priceInput(), { target: { value: '420.50' } });
    fireEvent.change(satInput(), { target: { value: '3016' } });
    fireEvent.click(saveButton());

    await screen.findByText(/La clave SAT debe tener 8 dígitos/i);
    // The form stays open with the values still in it, and nothing was added.
    expect(nameInput().value).toBe('Sellador de juntas');
    expect(screen.queryByText(/Producto guardado|guardado en tu catálogo/i)).toBeNull();
  });

  it('reports a network failure rather than pretending it saved', async () => {
    await openForm();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    fireEvent.change(nameInput(), { target: { value: 'Sellador de juntas' } });
    fireEvent.change(priceInput(), { target: { value: '420.50' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    expect(nameInput()).toBeTruthy();
  });
});

describe('deleting a product', () => {
  it('takes two taps, so one misplaced thumb does not remove a row', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/i }));

    // Armed, not deleted: no request yet, and the button now asks again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: /¿Eliminar definitivamente\?/i });
    expect(screen.getByRole('button', { name: /Cancelar/i })).toBeTruthy();
  });

  it('keeps the row on screen when the delete fails', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/i }));
    const confirm = await screen.findByRole('button', { name: /¿Eliminar definitivamente\?/i });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo eliminar el producto' } })
    );
    fireEvent.click(confirm);

    await screen.findByText(/No se pudo eliminar el producto/i);
    // #98's defect was the opposite: the row vanished locally and came back on
    // reload. A failed delete must leave it visible.
    expect(screen.getByText('Impermeabilizante acrílico 19L')).toBeTruthy();
  });
});

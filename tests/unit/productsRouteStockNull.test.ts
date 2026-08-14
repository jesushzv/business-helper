import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #261 — a blank Existencias field must store NULL, not 0.
 *
 * NULL means "servicio / sin inventario" across the codebase
 * (lib/inventory.ts). The client sends an explicit `null` for a blank field,
 * and the route's `stock_quantity !== undefined ? Number(stock_quantity) :
 * null` coerced it with `Number(null) === 0` — so every service stored through
 * the route rendered an amber "Stock: 0 unidades" badge, classified
 * `critical`, and reported `has_stock_tracking: true` to analytics.
 */

let insertedRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: {
          from: (table: string) => {
            if (table !== 'products') throw new Error(`unexpected table ${table}`);
            return {
              insert: (values: Record<string, unknown>) => {
                insertedRows.push(values);
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'p-1', ...values }, error: null }),
                  }),
                };
              },
            };
          },
        },
      },
    })),
  };
});

const { POST } = await import('@/app/api/products/route');

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

const SERVICE = {
  name: 'Servicios de Consultoría',
  description: 'Asesoría',
  unit_price: 3500,
  unit: 'E48',
  sat_product_code: '84111506',
};

beforeEach(() => {
  insertedRows = [];
});

describe('POST /api/products stock coercion (#261)', () => {
  it('stores NULL for an explicit null — the shape the form always sends for a blank field', async () => {
    const res = await post({ ...SERVICE, stock_quantity: null });
    expect(res.status).toBe(201);
    expect(insertedRows[0].stock_quantity).toBeNull();
  });

  it('stores NULL for an empty string', async () => {
    const res = await post({ ...SERVICE, stock_quantity: '' });
    expect(res.status).toBe(201);
    expect(insertedRows[0].stock_quantity).toBeNull();
  });

  it('stores the number when one was actually entered — zero included', async () => {
    const res = await post({ ...SERVICE, stock_quantity: 24 });
    expect(res.status).toBe(201);
    expect(insertedRows[0].stock_quantity).toBe(24);

    // An explicit 0 is a real answer ("agotado"), distinct from blank.
    const resZero = await post({ ...SERVICE, stock_quantity: 0 });
    expect(resZero.status).toBe(201);
    expect(insertedRows[1].stock_quantity).toBe(0);
  });

  it('refuses a non-numeric value instead of storing NaN', async () => {
    const res = await post({ ...SERVICE, stock_quantity: 'muchas' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/existencias/i);
    expect(insertedRows).toHaveLength(0);
  });

  it('stores NULL for a whitespace-only string — Number(" ") is 0, another phantom stock', async () => {
    const res = await post({ ...SERVICE, stock_quantity: '  ' });
    expect(res.status).toBe(201);
    expect(insertedRows[0].stock_quantity).toBeNull();
  });

  it('refuses a fractional value with its own message instead of a raw int4 22P02', async () => {
    const res = await post({ ...SERVICE, stock_quantity: 2.5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/entero/);
    expect(insertedRows).toHaveLength(0);
  });
});

import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { validateProductCatalogItem } from '@/lib/products';
import { requireOrgAccess } from '@/lib/apiAuth';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { apiError } from '@/lib/apiError';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ products: [] });
  }

  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products, error } = await (supabase as any)
      .from('products')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return apiError(500, 'SERVER_ERROR', 'No se pudieron cargar los productos');
    }

    return NextResponse.json({ products: products || [] });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudieron cargar los productos');
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const body = await request.json();
    const { name, description, unit_price, unit, sat_product_code, stock_quantity } = body;

    // NULL means "servicio / sin inventario" everywhere (lib/inventory.ts).
    // The client sends an explicit null for a blank Existencias field, and
    // `Number(null) === 0` turned every service into "Stock: 0 unidades" with
    // a critical-stock badge (#261). Absent stays absent; a present value must
    // be a real number.
    const normalizedStock =
      stock_quantity === undefined ||
      stock_quantity === null ||
      String(stock_quantity).trim() === ''
        ? null
        : Number(stock_quantity);

    // Integer, because the column is int4: a 2.5 reaching PostgREST answers a
    // raw 22P02 misdescribed as "fuera del rango". NaN and ±Infinity fail the
    // same check.
    if (normalizedStock !== null && !Number.isInteger(normalizedStock)) {
      return apiError(400, 'INVALID_PRODUCT', 'Las existencias deben ser un número entero, o dejarse vacías para un servicio.');
    }

    const validation = validateProductCatalogItem({
      name,
      description,
      unit_price: Number(unit_price),
      unit,
      sat_product_code,
      stock_quantity: normalizedStock
    });

    if (!validation.isValid) {
      return apiError(400, 'INVALID_PRODUCT', validation.errors.join(', '));
    }

    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newProduct, error } = await (supabase as any)
        .from('products')
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          description: description ? description.trim() : null,
          unit_price: Number(unit_price),
          unit: validation.unit,
          sat_product_code: validation.sat_product_code,
          stock_quantity: normalizedStock
        })
        .select()
        .single();

      // Previously fell through to a fabricated `prod-<timestamp>` object
      // with a 201, so the UI showed a product that was never stored.
      if (error || !newProduct) {
        return dbWriteErrorResponse(error, 'el producto', 'POST /api/products');
      }

      return NextResponse.json({ product: newProduct }, { status: 201 });
    }
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error interno al guardar producto');
  }
}

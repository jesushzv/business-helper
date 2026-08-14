import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { validateProductCatalogItem } from '@/lib/products';
import { requireOrgAccess } from '@/lib/apiAuth';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

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
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar los productos' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ products: products || [] });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar los productos' } },
      { status: 500 }
    );
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
      stock_quantity === undefined || stock_quantity === null || stock_quantity === ''
        ? null
        : Number(stock_quantity);

    if (normalizedStock !== null && !Number.isFinite(normalizedStock)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PRODUCT',
            message: 'Las existencias deben ser un número, o dejarse vacías para un servicio.',
          },
        },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: { code: 'INVALID_PRODUCT', message: validation.errors.join(', ') } },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno al guardar producto' } },
      { status: 500 }
    );
  }
}

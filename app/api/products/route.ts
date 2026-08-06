import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { validateProductCatalogItem } from '@/lib/products';
import { requireOrgAccess } from '@/lib/apiAuth';

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
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    return NextResponse.json({ products: products || [] });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const body = await request.json();
    const { name, description, unit_price, unit, sat_product_code, stock_quantity } = body;

    const validation = validateProductCatalogItem({
      name,
      description,
      unit_price: Number(unit_price),
      unit,
      sat_product_code,
      stock_quantity: stock_quantity ?? null
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
          stock_quantity: stock_quantity !== undefined ? Number(stock_quantity) : null
        })
        .select()
        .single();

      // Previously fell through to a fabricated `prod-<timestamp>` object
      // with a 201, so the UI showed a product that was never stored.
      if (error || !newProduct) {
        return NextResponse.json(
          { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar el producto' } },
          { status: 500 }
        );
      }

      return NextResponse.json(newProduct, { status: 201 });
    }
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno al guardar producto' } },
      { status: 500 }
    );
  }
}

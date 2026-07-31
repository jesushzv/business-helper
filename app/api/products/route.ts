import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { validateProductCatalogItem } from '@/lib/products';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ products: [] });
  }

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: products, error } = await (supabase as any)
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && products) {
      return NextResponse.json({ products });
    }
  } catch {
    // Fallback response for demo mode
  }

  return NextResponse.json({ products: [] });
}

export async function POST(request: Request) {
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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let orgId: string | null = null;
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (orgs && orgs.length > 0) {
        orgId = orgs[0].id;
      }
    }

    if (orgId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newProduct, error } = await (supabase as any)
        .from('products')
        .insert({
          organization_id: orgId,
          name: name.trim(),
          description: description ? description.trim() : null,
          unit_price: Number(unit_price),
          unit: validation.unit,
          sat_product_code: validation.sat_product_code,
          stock_quantity: stock_quantity !== undefined ? Number(stock_quantity) : null
        })
        .select()
        .single();

      if (!error && newProduct) {
        return NextResponse.json(newProduct, { status: 201 });
      }
    }

    // Demo fallback item return
    const demoItem = {
      id: `prod-${Date.now()}`,
      organization_id: orgId || 'org-demo-1',
      name: name.trim(),
      description: description || null,
      unit_price: Number(unit_price),
      unit: validation.unit,
      sat_product_code: validation.sat_product_code,
      stock_quantity: stock_quantity ?? null,
      created_at: new Date().toISOString()
    };

    return NextResponse.json(demoItem, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno al guardar producto' } },
      { status: 500 }
    );
  }
}

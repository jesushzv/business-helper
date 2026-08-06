import { NextResponse } from 'next/server';
import { evaluateStockStatus, deductStock } from '@/lib/inventory';
import { requireUser } from '@/lib/apiAuth';

export async function POST(request: Request) {
  // Pure computation, but a business endpoint nonetheless: it was callable
  // anonymously by anyone on the internet.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { currentStock, quantitySold } = body;

    const remainingStock = deductStock(currentStock, quantitySold);
    const evaluation = evaluateStockStatus(remainingStock);

    return NextResponse.json({
      previousStock: currentStock,
      quantitySold,
      remainingStock,
      evaluation
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'INVENTORY_ERROR', message: 'Error procesando inventario' } },
      { status: 500 }
    );
  }
}

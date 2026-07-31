import { NextResponse } from 'next/server';
import { evaluateStockStatus, deductStock } from '@/lib/inventory';

export async function POST(request: Request) {
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

/**
 * Quote Calculator & SAT Tax Aggregator Engine
 */

export interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  sat_code?: string;
  unit?: string;
}

export interface TaxOptions {
  applyIva?: boolean;
  applyRetencionIsr?: boolean;
  applyRetencionIva?: boolean;
}

export interface QuoteTotals {
  subtotal: number;
  ivaAmount: number;
  retencionIsrAmount: number;
  retencionIvaAmount: number;
  totalAmount: number;
}

export function calculateQuoteTotals(
  items: LineItem[],
  options: TaxOptions = { applyIva: true, applyRetencionIsr: false, applyRetencionIva: false }
): QuoteTotals {
  const subtotal = items.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return acc + qty * price;
  }, 0);

  const roundedSubtotal = Math.round(subtotal * 100) / 100;

  const applyIva = options.applyIva !== false;
  const iva = applyIva ? Math.round(roundedSubtotal * 0.16 * 100) / 100 : 0;
  const retIsr = options.applyRetencionIsr ? Math.round(roundedSubtotal * 0.10 * 100) / 100 : 0;
  const retIva = options.applyRetencionIva ? Math.round(roundedSubtotal * (10.6667 / 100) * 100) / 100 : 0;

  const total = Math.round((roundedSubtotal + iva - retIsr - retIva) * 100) / 100;

  return {
    subtotal: roundedSubtotal,
    ivaAmount: iva,
    retencionIsrAmount: retIsr,
    retencionIvaAmount: retIva,
    totalAmount: total,
  };
}

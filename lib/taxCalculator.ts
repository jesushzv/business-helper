import { TaxBreakdown } from '@/types';

/**
 * Calculates SAT taxes for quotes and contracts.
 * Standard IVA: 16%
 * ISR Withholding (RESICO / Professional services): 10%
 * IVA Withholding (Services rendered to Persona Moral): 10.6667% (2/3 of IVA)
 */
export function calculateQuoteTaxes(
  subtotal: number,
  applyIva: boolean = true,
  applyRetencionIsr: boolean = false,
  applyRetencionIva: boolean = false
): TaxBreakdown {
  const sub = Number(subtotal) || 0;
  const iva = applyIva ? Math.round(sub * 0.16 * 100) / 100 : 0;
  const retIsr = applyRetencionIsr ? Math.round(sub * 0.10 * 100) / 100 : 0;
  const retIva = applyRetencionIva ? Math.round(sub * (10.6667 / 100) * 100) / 100 : 0;
  const total = Math.round((sub + iva - retIsr - retIva) * 100) / 100;

  return {
    subtotal: sub,
    ivaAmount: iva,
    retencionIsrAmount: retIsr,
    retencionIvaAmount: retIva,
    totalAmount: total,
  };
}

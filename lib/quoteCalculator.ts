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

/**
 * The SAT tax categories a quote can carry (#407).
 *
 * These map to Anexo 20's `TipoFactor`: `iva_16` and `tasa_0` are both **Tasa**
 * (at 0.160000 and 0.000000), `exento` is **Exento**. The money is identical
 * for the last two — what differs is what the CFDI says about *why* there is no
 * tax, which is visible to the client's accountant and to the SAT.
 *
 * This array is the single statement of the vocabulary; the CHECK on
 * `quotes.tax_treatment` (migration 20260817200000) mirrors it.
 */
export const QUOTE_TAX_TREATMENTS = ['iva_16', 'tasa_0', 'exento'] as const;

export type QuoteTaxTreatment = (typeof QUOTE_TAX_TREATMENTS)[number];

/**
 * Read a stored or submitted treatment, or `null` for anything unrecognised.
 *
 * Never the nearest listed value: mapping an unknown to whatever looks closest
 * is how a `'free'` subscription tier came out as a $299 plan (#95), and how a
 * status the database had widened read as `Activo` (#116). `null` here means
 * "not stated", which the caller resolves by inferring from `iva_amount` —
 * the same answer every quote written before this column existed gets.
 *
 * Case is forgiven because the value arrives from a form and a database column
 * that were written years apart; nothing else is.
 */
export function normalizeQuoteTaxTreatment(
  value: string | null | undefined
): QuoteTaxTreatment | null {
  const candidate = (value || '').trim().toLowerCase();
  return (QUOTE_TAX_TREATMENTS as readonly string[]).includes(candidate)
    ? (candidate as QuoteTaxTreatment)
    : null;
}

export interface TaxOptions {
  /**
   * What the tenant stated. Wins over `applyIva` when both are present — the
   * wizard sends this, and a stale checkbox value must not override an explicit
   * choice.
   */
  taxTreatment?: QuoteTaxTreatment;
  /**
   * The pre-#407 switch. Kept because every quote in the database was created
   * through it, and because callers that never ask about exento should not have
   * to learn the vocabulary.
   */
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

  // Only `iva_16` charges IVA. `tasa_0` and `exento` both come to zero here and
  // differ only in what the CFDI says about it (#407). Falling back to
  // `applyIva` keeps every pre-#407 caller behaving exactly as before.
  const applyIva = options.taxTreatment
    ? options.taxTreatment === 'iva_16'
    : options.applyIva !== false;
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

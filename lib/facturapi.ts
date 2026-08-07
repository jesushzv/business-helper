/**
 * SAT CFDI 4.0 payload construction and validation — Business Helper
 *
 * This module shapes what gets sent to a PAC. It no longer stamps anything, and
 * it no longer pretends to: `simulateInvoiceStamping` fabricated an id and two
 * storage.businesshelper.mx URLs, and `issueInvoiceClient` silently fell back
 * to it whenever the live call failed or no key was configured — so the caller,
 * the database and the user all recorded a stamp the SAT had never seen. The
 * transport now lives in lib/pacClient.ts, which has no such fallback.
 *
 * What remains here is the part that has to be right before a PAC is contacted
 * at all: a CFDI rejected by the SAT costs a round trip, and one accepted with
 * the wrong data costs a cancellation.
 */

export interface CFDIItemInput {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  unit?: string;
  sat_product_code?: string;
  satProductCode?: string;
}

export interface CFDIMetadataInput {
  issuerRfc: string;
  issuerRegimen?: string;
  issuerPostalCode?: string;
  receiverRfc: string;
  receiverRegimen?: string;
  receiverPostalCode?: string;
  cfdiUse?: string;
  lineItems: Array<{
    name?: string;
    description?: string;
    unitPrice?: number;
    unit?: string;
    satProductCode?: string;
  }>;
}

export const RFC_PATTERN = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;

export function validateCFDIMetadata(metadata: CFDIMetadataInput): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!metadata || typeof metadata !== 'object') {
    return { isValid: false, errors: ['Metadata es requerida'] };
  }

  if (!metadata.issuerRfc || !RFC_PATTERN.test(metadata.issuerRfc.trim())) {
    errors.push('RFC del emisor es inválido (debe tener 12 o 13 caracteres)');
  }
  if (!metadata.receiverRfc || !RFC_PATTERN.test(metadata.receiverRfc.trim())) {
    errors.push('RFC del receptor es inválido');
  }

  if (metadata.issuerPostalCode && !/^\d{5}$/.test(metadata.issuerPostalCode.trim())) {
    errors.push('Código postal del emisor debe tener 5 dígitos');
  }
  if (metadata.receiverPostalCode && !/^\d{5}$/.test(metadata.receiverPostalCode.trim())) {
    errors.push('Código postal del receptor debe tener 5 dígitos');
  }

  if (!Array.isArray(metadata.lineItems) || metadata.lineItems.length === 0) {
    errors.push('Debe incluir al menos un concepto en la factura');
  } else {
    metadata.lineItems.forEach((item, index) => {
      const price = item.unitPrice ?? 0;
      if (price <= 0) {
        errors.push(`El concepto #${index + 1} debe tener un precio mayor a $0`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export interface CFDIParty {
  name: string;
  rfc?: string | null;
  regimen_fiscal?: string | null;
  codigo_postal?: string | null;
  cfdi_use?: string | null;
}

/**
 * Checks that both parties carry the fiscal data CFDI 4.0 requires.
 *
 * 4.0 validates the receiver's name, RFC, régimen and postal code against the
 * SAT's own registry: a mismatch is rejected at stamping, not at filing. The
 * cost of finding out here rather than there is one form message instead of a
 * failed stamp the user has to interpret.
 *
 * Missing data used to be papered over by defaults in `buildCFDIPayload` —
 * `tax_id: 'XAXX010101000'` in particular, which is *público en general*. A
 * named client silently invoiced as the general public cannot deduct it, which
 * is usually the entire reason they asked for a CFDI.
 */
export function validateInvoiceParties(
  issuer: CFDIParty,
  receiver: CFDIParty
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!issuer?.rfc || !RFC_PATTERN.test(String(issuer.rfc).trim())) {
    errors.push('Tu negocio no tiene un RFC válido. Complétalo en Ajustes antes de facturar.');
  }
  if (!issuer?.regimen_fiscal) {
    errors.push('Falta el régimen fiscal de tu negocio. Complétalo en Ajustes antes de facturar.');
  }
  if (!issuer?.codigo_postal || !/^\d{5}$/.test(String(issuer.codigo_postal).trim())) {
    errors.push('Falta el código postal de tu negocio. Complétalo en Ajustes antes de facturar.');
  }

  if (!receiver?.name) {
    errors.push('El cliente no tiene razón social registrada.');
  }
  if (!receiver?.rfc || !RFC_PATTERN.test(String(receiver.rfc).trim())) {
    errors.push('El cliente no tiene un RFC válido. Actualízalo en su ficha para poder facturarle.');
  }
  if (!receiver?.regimen_fiscal) {
    errors.push('Falta el régimen fiscal del cliente (requisito de CFDI 4.0).');
  }
  if (!receiver?.codigo_postal || !/^\d{5}$/.test(String(receiver.codigo_postal).trim())) {
    errors.push('Falta el código postal del cliente (requisito de CFDI 4.0).');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Builds the Facturapi invoice body.
 *
 * The issuer is not part of it: a PAC stamps under the account the API key
 * belongs to, which is why the issuer's data is validated above rather than
 * sent. The receiver's fields are taken as given — `validateInvoiceParties`
 * runs first, so there is nothing left to substitute a default for.
 */
export function buildCFDIPayload(
  issuer: CFDIParty,
  receiver: CFDIParty,
  items: CFDIItemInput[],
  options?: { paymentMethod?: 'PUE' | 'PPD'; paymentForm?: string }
) {
  const method = options?.paymentMethod || 'PUE';
  // SAT Rule: PPD must use payment_form '99' (Por definir)
  const form = method === 'PPD' ? '99' : (options?.paymentForm || '03');

  return {
    customer: {
      legal_name: receiver.name,
      tax_id: receiver.rfc ? String(receiver.rfc).toUpperCase().trim() : '',
      tax_system: receiver.regimen_fiscal || '',
      zip: receiver.codigo_postal || ''
    },
    use: receiver.cfdi_use || 'G03',
    payment_form: form,
    payment_method: method,
    currency: 'MXN',
    items: (items || []).map((item) => {
      const price = item.unit_price ?? item.amount ?? 0;
      // 84111506 is "Servicios de facturación"; it applies to the professional
      // services this product was built around and is what a milestone without
      // a catalogued product falls back to. A line from the product catalogue
      // carries its own clave.
      const productKey = item.sat_product_code || item.satProductCode || '84111506';
      const unitKey = item.unit || 'E48';
      return {
        quantity: item.quantity || 1,
        product_key: productKey,
        unit_key: unitKey,
        description: item.description || 'Servicio Profesional',
        price: price,
        taxes: [
          {
            type: 'IVA',
            rate: 0.16
          }
        ]
      };
    })
  };
}

export interface CFDITax {
  type: 'IVA' | 'ISR';
  rate: number;
  withholding?: boolean;
}

export interface CFDITaxTreatment {
  /** Share of the amount charged that is the pre-tax base. */
  baseRatio: number;
  taxes: CFDITax[];
}

/** Tax totals as stored on a quote; every column arrives as a string from PostgREST. */
export interface QuoteTaxProfile {
  subtotal_amount?: number | string | null;
  iva_amount?: number | string | null;
  retencion_isr_amount?: number | string | null;
  retencion_iva_amount?: number | string | null;
  total_amount?: number | string | null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(parsed) ? (parsed as number) : 0;
}

/** Six decimals is what SAT Anexo 20 allows for a tax rate (10.6667% retención de IVA). */
function toRate(part: number, base: number): number {
  return Math.round((part / base) * 1_000_000) / 1_000_000;
}

/**
 * Recovers the tax treatment behind an amount owed.
 *
 * A milestone's `amount` is a slice of the contract total, and a contract total
 * is a quote's `total_amount` — IVA already added and retenciones already
 * subtracted. Facturapi, by contrast, takes the pre-tax price and applies the
 * taxes itself. Sending the milestone amount as the price would stamp a
 * document 16% larger than the client agreed to pay.
 *
 * The ratio is taken from the originating quote so retenciones (10% ISR,
 * 10.6667% IVA on services to a persona moral) are reproduced rather than
 * assumed away. Without a quote — a milestone entered by hand — the amount is
 * treated as IVA-inclusive at 16%, which is what `calculateQuoteTaxes` applies
 * by default.
 */
export function deriveCFDITaxTreatment(profile?: QuoteTaxProfile | null): CFDITaxTreatment {
  const subtotal = toNumber(profile?.subtotal_amount);
  const total = toNumber(profile?.total_amount);

  if (subtotal <= 0 || total <= 0) {
    return { baseRatio: 1 / 1.16, taxes: [{ type: 'IVA', rate: 0.16 }] };
  }

  const taxes: CFDITax[] = [];
  const iva = toNumber(profile?.iva_amount);
  const retencionIsr = toNumber(profile?.retencion_isr_amount);
  const retencionIva = toNumber(profile?.retencion_iva_amount);

  if (iva > 0) {
    taxes.push({ type: 'IVA', rate: toRate(iva, subtotal) });
  }
  if (retencionIsr > 0) {
    taxes.push({ type: 'ISR', rate: toRate(retencionIsr, subtotal), withholding: true });
  }
  if (retencionIva > 0) {
    taxes.push({ type: 'IVA', rate: toRate(retencionIva, subtotal), withholding: true });
  }

  return { baseRatio: subtotal / total, taxes };
}

/**
 * Turns a milestone into the single CFDI concept that covers it.
 *
 * Cents can differ from the milestone amount by a rounding step once the PAC
 * recomputes the taxes from the base — the base is what the document is built
 * on, so it is the value carried across rather than the total.
 */
export function buildMilestoneLineItem(
  description: string,
  amountCharged: number,
  treatment: CFDITaxTreatment,
  satProductCode?: string | null
) {
  return {
    quantity: 1,
    product_key: satProductCode || '84111506',
    unit_key: 'E48',
    description,
    price: Math.round(amountCharged * treatment.baseRatio * 100) / 100,
    taxes: treatment.taxes,
  };
}

/**
 * Builds Facturapi API payload for SAT Complemento de Recepción de Pagos (CPP)
 * when a payment is confirmed for a PPD invoice.
 */
export function buildComplementoPagoPayload(input: {
  invoiceId: string;
  amount: number;
  paymentForm?: string;
  operationNumber?: string;
  date?: string;
}) {
  return {
    type: 'P',
    payments: [
      {
        payment_form: input.paymentForm || '03',
        currency: 'MXN',
        amount: input.amount,
        date: input.date || new Date().toISOString(),
        operation_number: input.operationNumber || `SPEI-${Date.now()}`,
        related_documents: [
          {
            invoice_id: input.invoiceId,
            installment: 1,
            currency: 'MXN'
          }
        ]
      }
    ]
  };
}

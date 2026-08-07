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

/** Money as the SAT reads it: two decimals, no floating-point tail. */
function toMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** One line of ImpuestosDR — the tax breakdown a payment carries per related document. */
export interface ComplementoPagoTaxLine {
  base: number;
  type: 'IVA' | 'ISR';
  rate: number;
  withholding?: boolean;
}

export interface ComplementoPagoInput {
  /** The receiver of the payment complement — the same client the PPD invoice was issued to. */
  customer: CFDIParty;
  /** Folio fiscal of the PPD invoice this payment settles. Preferred over `invoiceId`. */
  uuid?: string | null;
  /** The PAC's own id for that invoice, used when the folio fiscal is not to hand. */
  invoiceId?: string | null;
  /** ImpPagado — what was actually received. */
  amount: number;
  /** ImpSaldoAnt — what was outstanding on the invoice before this payment. */
  lastBalance: number;
  /** NumParcialidad — 1 for the first payment against the document, 2 for the next. */
  installment: number;
  /** SAT c_FormaPago; '03' is transferencia electrónica (SPEI). */
  paymentForm?: string;
  /** NumOperacion — the SPEI tracking reference, when the payer captured one. */
  operationNumber?: string | null;
  /** FechaPago. Defaults to now. */
  date?: string;
  /** Tax treatment of the invoice, so ImpuestosDR reproduces its retenciones. */
  treatment?: CFDITaxTreatment | null;
}

/**
 * Builds the Facturapi body for a SAT Complemento de Recepción de Pagos.
 *
 * A CFDI stamped PPD does not record a payment — it records that one is owed.
 * The payment itself is a second document, type `P`, due to the SAT in the
 * first days of the month following each amount received. Issuing the PPD
 * invoice and never filing the complement leaves the taxpayer non-compliant on
 * an obligation this product created for them.
 *
 * Three things distinguish it from an ordinary invoice and are the reason the
 * arguments look the way they do:
 *
 *   - It carries no priced concepts. The PAC generates the single mandatory
 *     "Pago" line; what the caller supplies is the payment and the document it
 *     applies to.
 *   - The balances are part of the stamped record. `last_balance` (ImpSaldoAnt)
 *     and the amount paid have to reconcile with the related CFDI and with the
 *     complements already filed against it, or the SAT rejects the document.
 *   - `installment` is the ordinal of this payment, not a constant. It used to
 *     be hardcoded to `1` here, which is only correct while every PPD invoice
 *     is settled in a single transfer.
 *
 * The shape follows Facturapi's `complements: [{ type: 'pago', data: [...] }]`
 * envelope. The earlier draft of this function emitted a top-level `payments`
 * array, which no PAC accepts; nothing ever sent it, so nothing depended on it.
 */
export function buildComplementoPagoPayload(input: ComplementoPagoInput) {
  const amount = toMoney(input.amount);
  const lastBalance = toMoney(input.lastBalance);

  const related: Record<string, unknown> = {
    installment: input.installment,
    last_balance: lastBalance,
    amount,
    currency: 'MXN',
  };

  // The folio fiscal is what the SAT matches on. `invoice_id` is a Facturapi
  // convenience for documents stamped through the same account, and is only
  // used when the UUID is not on record.
  if (input.uuid) {
    related.uuid = String(input.uuid).toUpperCase();
  } else if (input.invoiceId) {
    related.invoice_id = input.invoiceId;
  }

  if (input.treatment && input.treatment.taxes.length > 0) {
    // ImpuestosDR is computed on the pre-tax share of the amount paid, so a
    // partial payment carries a proportional slice of the invoice's IVA and
    // retenciones rather than the whole document's.
    const base = toMoney(amount * input.treatment.baseRatio);
    const taxes: ComplementoPagoTaxLine[] = input.treatment.taxes.map((tax) => ({
      base,
      type: tax.type,
      rate: tax.rate,
      ...(tax.withholding ? { withholding: true } : {}),
    }));
    related.taxes = taxes;
  }

  return {
    type: 'P' as const,
    customer: {
      legal_name: input.customer.name,
      tax_id: input.customer.rfc ? String(input.customer.rfc).toUpperCase().trim() : '',
      tax_system: input.customer.regimen_fiscal || '',
      zip: input.customer.codigo_postal || '',
    },
    complements: [
      {
        type: 'pago' as const,
        data: [
          {
            payment_form: input.paymentForm || '03',
            currency: 'MXN',
            date: input.date || new Date().toISOString(),
            // NumOperacion is optional for a SPEI transfer that has no
            // reference; a fabricated `SPEI-<timestamp>` was worse than
            // omitting it, since it looks like a real trace and matches
            // nothing at the bank.
            ...(input.operationNumber ? { operation_number: input.operationNumber } : {}),
            related_documents: [related],
          },
        ],
      },
    ],
  };
}

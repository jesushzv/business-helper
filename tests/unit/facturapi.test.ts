import { describe, it, expect } from 'vitest';
import {
  validateCFDIMetadata,
  validateInvoiceParties,
  buildCFDIPayload,
  buildComplementoPagoPayload,
  deriveCFDITaxTreatment,
  buildMilestoneLineItem,
} from '@/lib/facturapi';

describe('Facturapi SAT CFDI 4.0 payload construction', () => {
  it('should validate CFDI metadata successfully for valid issuer and receiver', () => {
    const res = validateCFDIMetadata({
      issuerRfc: 'ABC120315HD9',
      issuerPostalCode: '64000',
      receiverRfc: 'GORM850101789',
      receiverPostalCode: '64000',
      lineItems: [{ unitPrice: 1500, description: 'Servicios de Consultoría' }],
    });
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('should reject invalid RFC format or zero unit price in line items', () => {
    const res = validateCFDIMetadata({
      issuerRfc: 'INVALID_RFC',
      issuerPostalCode: '123',
      receiverRfc: 'GORM850101789',
      receiverPostalCode: 'ABCDE',
      lineItems: [{ unitPrice: 0, description: 'Producto Sin Costo' }],
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('RFC del emisor'))).toBe(true);
    expect(res.errors.some((e) => e.includes('precio mayor a $0'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Código postal'))).toBe(true);
  });

  it('should construct valid SAT CFDI payload with default PUE payment method and 16% IVA tax', () => {
    const payload = buildCFDIPayload(
      { name: 'Empresa Demo SA de CV', rfc: 'ABC120315HD9', regimen_fiscal: '601', codigo_postal: '64000' },
      { name: 'Cliente Ejemplo', rfc: 'GORM850101789', regimen_fiscal: '612', codigo_postal: '64000', cfdi_use: 'G03' },
      [{ description: 'Servicio de Mantenimiento', amount: 5000, sat_product_code: '84111506' }]
    );
    expect(payload.payment_method).toBe('PUE');
    expect(payload.customer.legal_name).toBe('Cliente Ejemplo');
    expect(payload.customer.tax_id).toBe('GORM850101789');
    // v2 shape, matched against what the live API accepted and refused (#26):
    // the zip nests under address, the priced concept nests under product, and
    // tax_included is explicit because v2 defaults it to true — which would
    // read a pre-tax price as the final total.
    expect(payload.customer).not.toHaveProperty('zip');
    expect(payload.customer.address.zip).toBe('64000');
    expect(payload.items[0]).not.toHaveProperty('product_key');
    expect(payload.items[0].product.product_key).toBe('84111506');
    expect(payload.items[0].product.tax_included).toBe(false);
    expect(payload.items[0].product.taxes[0].rate).toBe(0.16);
  });

  it('should set payment_form to "99" (Por definir) for PPD payment_method per SAT Anexo 20 rules', () => {
    const payload = buildCFDIPayload(
      { name: 'Empresa Demo SA' },
      { name: 'Cliente Ejemplo' },
      [{ description: 'Servicio A Crédito', amount: 10000 }],
      { paymentMethod: 'PPD' }
    );
    expect(payload.payment_method).toBe('PPD');
    expect(payload.payment_form).toBe('99');
  });

  it('should never substitute público en general for a named client without an RFC', () => {
    // The old builder defaulted tax_id to 'XAXX010101000', which invoices the
    // general public: the client could not deduct the very CFDI they asked for.
    const payload = buildCFDIPayload(
      { name: 'Empresa Demo SA' },
      { name: 'Cliente Sin RFC' },
      [{ description: 'Servicio', amount: 1000 }]
    );
    expect(payload.customer.tax_id).toBe('');
  });

  describe('Complemento de Recepción de Pagos', () => {
    const receiver = {
      name: 'Cliente Ejemplo',
      rfc: 'gorm850101789',
      regimen_fiscal: '612',
      codigo_postal: '64000',
    };

    /** The single payment inside the `complements: [{type: 'pago', data: [...]}]` envelope. */
    function paymentOf(payload: ReturnType<typeof buildComplementoPagoPayload>) {
      return payload.complements[0].data[0];
    }

    it('builds a type P document that references the invoice by folio fiscal', () => {
      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
        invoiceId: 'cfdi_12345',
        amount: 5000,
        lastBalance: 5000,
        installment: 1,
        paymentForm: '03',
        operationNumber: 'SPEI-88992',
      });

      const payment = paymentOf(cpp);

      expect(cpp.type).toBe('P');
      expect(cpp.complements[0].type).toBe('pago');
      expect(cpp.customer.tax_id).toBe('GORM850101789');
      expect(payment.payment_form).toBe('03');
      expect(payment.operation_number).toBe('SPEI-88992');
      // The SAT matches on the folio fiscal; `invoice_id` is only a fallback.
      expect(payment.related_documents[0].uuid).toBe('A1B2C3D4-0000-4444-8888-ABCDEFABCDEF');
      expect(payment.related_documents[0].invoice_id).toBeUndefined();
      expect(payment.related_documents[0].amount).toBe(5000);
      expect(payment.related_documents[0].last_balance).toBe(5000);
      expect(payment.related_documents[0].installment).toBe(1);
    });

    it('falls back to the PAC invoice id only when the folio fiscal is unknown', () => {
      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        invoiceId: 'cfdi_12345',
        amount: 1000,
        lastBalance: 1000,
        installment: 1,
      });

      expect(paymentOf(cpp).related_documents[0].invoice_id).toBe('cfdi_12345');
      expect(paymentOf(cpp).related_documents[0].uuid).toBeUndefined();
    });

    it('carries the parcialidad and the balances of a partial payment', () => {
      // `installment` was hardcoded to 1, which is only correct while every PPD
      // invoice is settled in a single transfer.
      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
        amount: 2000,
        lastBalance: 5000,
        installment: 2,
      });

      const related = paymentOf(cpp).related_documents[0];
      expect(related.installment).toBe(2);
      expect(related.amount).toBe(2000);
      expect(related.last_balance).toBe(5000);
    });

    it('applies the invoice tax treatment to the share of the amount paid', () => {
      // Half of a 11,600 PPD invoice at 16% IVA: ImpuestosDR is computed on the
      // pre-tax slice of what was received, not on the whole document.
      const treatment = deriveCFDITaxTreatment({
        subtotal_amount: 10000,
        iva_amount: 1600,
        total_amount: 11600,
      });

      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
        amount: 5800,
        lastBalance: 11600,
        installment: 1,
        treatment,
      });

      const taxes = paymentOf(cpp).related_documents[0].taxes as Array<Record<string, unknown>>;
      expect(taxes).toHaveLength(1);
      expect(taxes[0].base).toBe(5000);
      expect(taxes[0].rate).toBe(0.16);
    });

    it('reproduces retenciones rather than assuming a plain 16% IVA', () => {
      const treatment = deriveCFDITaxTreatment({
        subtotal_amount: 10000,
        iva_amount: 1600,
        retencion_isr_amount: 1000,
        retencion_iva_amount: 1066.67,
        total_amount: 9533.33,
      });

      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
        amount: 9533.33,
        lastBalance: 9533.33,
        installment: 1,
        treatment,
      });

      const taxes = paymentOf(cpp).related_documents[0].taxes as Array<Record<string, unknown>>;
      expect(taxes).toHaveLength(3);
      expect(taxes.filter((t) => t.withholding === true)).toHaveLength(2);
    });

    it('omits the operation number rather than inventing a SPEI reference', () => {
      // `SPEI-${Date.now()}` looked like a real trace and matched nothing at
      // the bank.
      const cpp = buildComplementoPagoPayload({
        customer: receiver,
        uuid: 'a1b2c3d4-0000-4444-8888-abcdefabcdef',
        amount: 100,
        lastBalance: 100,
        installment: 1,
      });

      expect(paymentOf(cpp).operation_number).toBeUndefined();
      expect(JSON.stringify(cpp)).not.toMatch(/SPEI-\d{6,}/);
    });
  });

  it('should no longer expose a stamping simulation', async () => {
    const facturapi = await import('@/lib/facturapi');
    expect('simulateInvoiceStamping' in facturapi).toBe(false);
    expect('issueInvoiceClient' in facturapi).toBe(false);
  });
});

describe('CFDI 4.0 party validation', () => {
  const issuer = {
    name: 'Distribuidora del Norte',
    rfc: 'DNO850101HD9',
    regimen_fiscal: '601',
    codigo_postal: '64000',
  };
  const receiver = {
    name: 'Construcciones Maya',
    rfc: 'CMA120315HD9',
    regimen_fiscal: '601',
    codigo_postal: '64720',
  };

  it('accepts two fully identified parties', () => {
    expect(validateInvoiceParties(issuer, receiver).isValid).toBe(true);
  });

  it('names the issuer data the SAT will reject before contacting the PAC', () => {
    const result = validateInvoiceParties({ ...issuer, rfc: null, regimen_fiscal: null }, receiver);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('RFC'))).toBe(true);
    expect(result.errors.some((e) => e.includes('régimen fiscal de tu negocio'))).toBe(true);
  });

  it('requires the receiver régimen and postal code CFDI 4.0 validates against the SAT registry', () => {
    const result = validateInvoiceParties(issuer, {
      ...receiver,
      regimen_fiscal: null,
      codigo_postal: '123',
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('régimen fiscal del cliente'))).toBe(true);
    expect(result.errors.some((e) => e.includes('código postal del cliente'))).toBe(true);
  });
});

describe('Tax treatment behind a milestone amount', () => {
  it('recovers the pre-tax base from a quote that only applied IVA', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      total_amount: 11600,
    });

    expect(treatment.baseRatio).toBeCloseTo(10000 / 11600, 6);
    expect(treatment.taxes).toEqual([{ type: 'IVA', rate: 0.16 }]);
  });

  it('reproduces ISR and IVA retenciones rather than assuming them away', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      retencion_isr_amount: 1000,
      retencion_iva_amount: 1066.67,
      total_amount: 9533.33,
    });

    expect(treatment.taxes).toContainEqual({ type: 'ISR', rate: 0.1, withholding: true });
    expect(treatment.taxes).toContainEqual({ type: 'IVA', rate: 0.106667, withholding: true });
    // The base is larger than what the client pays once retenciones come out.
    expect(treatment.baseRatio).toBeGreaterThan(1);
  });

  it('treats a milestone with no quote behind it as IVA-inclusive at 16%', () => {
    const treatment = deriveCFDITaxTreatment(null);
    expect(treatment.baseRatio).toBeCloseTo(1 / 1.16, 6);
    expect(treatment.taxes).toEqual([{ type: 'IVA', rate: 0.16 }]);
  });

  it('parses the strings PostgREST returns for numeric columns', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: '10000.00',
      iva_amount: '1600.00',
      total_amount: '11600.00',
    });
    expect(treatment.baseRatio).toBeCloseTo(10000 / 11600, 6);
  });

  /**
   * The quote wizard has an IVA checkbox (`applyIva`, QuoteWizardModal), so a
   * quote whose `iva_amount` is 0 is a state a tenant reaches on purpose — not a
   * malformed row. The treatment describes the *quote*, so an empty tax list is
   * the honest answer here; what must never happen is that empty list reaching
   * the PAC as an omitted field. That is asserted at the payload boundary below.
   */
  it('reports no tax lines for a quote created with IVA switched off', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 0,
      total_amount: 10000,
    });

    expect(treatment.taxes).toEqual([]);
    expect(treatment.baseRatio).toBe(1);
  });
});

/**
 * #347, and the same defect class as #26's four payload findings: a mocked
 * transport pins what we *believe* v2 does with a payload we have never sent.
 *
 * Facturapi v2 applies a default 16% IVA to a product whose taxes are absent.
 * An exempt quote produced `taxes: []`, and whether v2 reads that as "no taxes"
 * or as "absent" decides whether a client is billed 16% they never agreed to —
 * on a document that cannot be un-issued, only cancelled with a motive.
 *
 * Rather than probe which reading v2 takes (that needs a credential this repo
 * does not have), the ambiguity is removed: an explicit zero-rate entry is
 * unambiguous under *both* readings.
 */
describe('The PAC payload never leaves a tax treatment implicit', () => {
  const exempt = deriveCFDITaxTreatment({
    subtotal_amount: 10000,
    iva_amount: 0,
    total_amount: 10000,
  });

  it('sends an explicit zero-rate IVA line instead of an empty taxes array', () => {
    const item = buildMilestoneLineItem('Servicio exento', 10000, exempt);

    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0 }]);
  });

  it('never emits an empty taxes array, which v2 may read as absent', () => {
    const item = buildMilestoneLineItem('Servicio exento', 10000, exempt);

    expect(item.product.taxes.length).toBeGreaterThan(0);
  });

  it('carries the full amount as the base when no tax was applied', () => {
    const item = buildMilestoneLineItem('Servicio exento', 10000, exempt);

    // baseRatio is 1, so the client pays exactly the base — a 16% default
    // applied by the PAC would stamp 11600 against an agreed 10000.
    expect(item.product.price).toBe(10000);
    expect(item.product.tax_included).toBe(false);
  });

  it('leaves a taxed quote exactly as it was', () => {
    const taxed = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      total_amount: 11600,
    });
    const item = buildMilestoneLineItem('Servicio gravado', 11600, taxed);

    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0.16 }]);
    expect(item.product.price).toBe(10000);
  });

  it('bills the milestone amount, not the amount plus another 16%', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      total_amount: 11600,
    });
    const item = buildMilestoneLineItem('Anticipo 50%', 5800, treatment);

    expect(item.product.price).toBe(5000);
    // 5000 + 16% is the 5800 the client agreed to pay.
    expect(item.product.price * 1.16).toBeCloseTo(5800, 2);
    // The base only becomes the right total if the PAC is told the price
    // excludes tax — v2's default is the opposite (observed live, #26).
    expect(item.product.tax_included).toBe(false);
    expect(item.quantity).toBe(1);
    expect(item.product.product_key).toBe('84111506');
  });
});

/**
 * #407 — the payload says which SAT category applies, instead of inferring one.
 *
 * Since #347 an IVA-free quote sent an explicit `rate: 0` rather than an empty
 * array, which closed the 16%-overcharge risk but classified every such quote
 * as **zero-rate**. That was a documented guess: `iva_amount = 0` cannot tell
 * `Tasa 0.000000` from `Exento`, and the two are different things on the
 * document.
 *
 * `quotes.tax_treatment` now carries the answer. NULL means the quote predates
 * the question, and the old inference stands — so nothing already stamped
 * changes meaning.
 *
 * **The exento encoding is `factor: 'Exento'` with `rate: 0`.** `TipoFactor`
 * with values Tasa | Cuota | Exento is SAT Anexo 20, not a Facturapi invention,
 * and Facturapi's `factor` maps to it — but that this is the field's name and
 * literal was NOT confirmed against a primary source: `docs.facturapi.io` is
 * unreachable from CI and both official client-library READMEs omit tax
 * examples. One sandbox stamp of an exempt quote, with the document's tax lines
 * read back, is what settles it (see the first-live-stamp preflight). These
 * assertions pin what we *send*, not what v2 was observed to accept.
 */
describe('An exempt quote is stamped as exento, not as zero-rate (#407)', () => {
  const base = { subtotal_amount: 10000, iva_amount: 0, total_amount: 10000 };

  it('sends factor Exento for a quote the tenant marked exempt', () => {
    const treatment = deriveCFDITaxTreatment({ ...base, tax_treatment: 'exento' });
    const item = buildMilestoneLineItem('Consulta médica', 10000, treatment);

    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0, factor: 'Exento' }]);
  });

  it('sends a plain zero rate for a quote the tenant marked zero-rated', () => {
    const treatment = deriveCFDITaxTreatment({ ...base, tax_treatment: 'tasa_0' });
    const item = buildMilestoneLineItem('Exportación', 10000, treatment);

    // No `factor`: Tasa is v2's default, and stating it adds a field we have
    // not confirmed is accepted on the ordinary path.
    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0 }]);
  });

  it('charges 16% when the tenant marked it ordinary', () => {
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      total_amount: 11600,
      tax_treatment: 'iva_16',
    });

    expect(treatment.taxes).toEqual([{ type: 'IVA', rate: 0.16 }]);
  });

  it('falls back to the old inference when the quote predates the column', () => {
    // NULL treatment, no IVA: exactly what a pre-#407 quote looks like. It must
    // keep stamping as zero-rate, because that is what it stamped as yesterday.
    const treatment = deriveCFDITaxTreatment({ ...base, tax_treatment: null });
    const item = buildMilestoneLineItem('Servicio', 10000, treatment);

    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0 }]);
  });

  it('ignores a treatment the CHECK constraint would not allow', () => {
    // A value that reached the row some other way must not become a tax line.
    const treatment = deriveCFDITaxTreatment({
      ...base,
      tax_treatment: 'exempt' as unknown as string,
    });
    const item = buildMilestoneLineItem('Servicio', 10000, treatment);

    expect(item.product.taxes).toEqual([{ type: 'IVA', rate: 0 }]);
  });

  it('never lets exento reach a quote that actually charged IVA', () => {
    // Contradictory row: marked exento but carrying IVA. The money wins — the
    // client was charged 16% and the document must say so.
    const treatment = deriveCFDITaxTreatment({
      subtotal_amount: 10000,
      iva_amount: 1600,
      total_amount: 11600,
      tax_treatment: 'exento',
    });

    expect(treatment.taxes).toEqual([{ type: 'IVA', rate: 0.16 }]);
  });
});

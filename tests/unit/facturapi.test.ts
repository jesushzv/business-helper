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

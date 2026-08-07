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
    expect(payload.items[0].taxes[0].rate).toBe(0.16);
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

  it('should construct Complemento de Recepción de Pagos (CPP) payload for confirmed PPD payment', () => {
    const cpp = buildComplementoPagoPayload({
      invoiceId: 'cfdi_12345',
      amount: 5000,
      paymentForm: '03',
      operationNumber: 'SPEI-88992',
    });
    expect(cpp.type).toBe('P');
    expect(cpp.payments[0].amount).toBe(5000);
    expect(cpp.payments[0].operation_number).toBe('SPEI-88992');
    expect(cpp.payments[0].related_documents[0].invoice_id).toBe('cfdi_12345');
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

    expect(item.price).toBe(5000);
    // 5000 + 16% is the 5800 the client agreed to pay.
    expect(item.price * 1.16).toBeCloseTo(5800, 2);
    expect(item.quantity).toBe(1);
    expect(item.product_key).toBe('84111506');
  });
});

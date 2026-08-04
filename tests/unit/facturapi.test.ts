import { describe, it, expect } from 'vitest';
import {
  validateCFDIMetadata,
  buildCFDIPayload,
  buildComplementoPagoPayload,
  simulateInvoiceStamping,
  issueInvoiceClient,
} from '@/lib/facturapi';

describe('Facturapi SAT CFDI 4.0 PAC Integration Engine', () => {
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
      { name: 'Empresa Demo SA de CV', rfc: 'ABC120315HD9', codigo_postal: '64000' },
      { name: 'Cliente Ejemplo', rfc: 'GORM850101789', cfdi_use: 'G03' },
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

  it('should return simulated CFDI stamping response in sandbox mode', async () => {
    const sim = simulateInvoiceStamping('milestone_777');
    expect(sim.cfdiId).toMatch(/^cfdi_/);
    expect(sim.status).toBe('issued');
    expect(sim.pdfUrl).toContain('.pdf');

    const result = await issueInvoiceClient({} as any, 'milestone_777', true);
    expect(result.status).toBe('issued');
    expect(result.pdfUrl).toBeDefined();
  });
});

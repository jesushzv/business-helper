import { describe, it, expect } from 'vitest';
import { generateNotaDeVentaPayload, generateReceiptWhatsAppLink } from '@/lib/receiptGenerator';

describe('Nota de Venta & Zero-SAT Recibo Generator', () => {
  it('applies 16% IVA and formats the tenant-branded totals', () => {
    const payload = generateNotaDeVentaPayload(
      {
        title: 'Desarrollo Web E-Commerce',
        clientName: 'Distribuidora del Norte S.A.',
        clientRfc: 'DNO120405XYZ',
        amount: 10000,
        includeIva: true,
      },
      { name: 'Agencia Digital MX', rfc: 'ADM180909ABC' }
    );

    expect(payload.tenant.name).toBe('Agencia Digital MX');
    expect(payload.client.name).toBe('Distribuidora del Norte S.A.');
    expect(payload.subtotal).toBe(10000);
    expect(payload.ivaAmount).toBe(1600);
    expect(payload.total).toBe(11600);
    expect(payload.formattedTotal).toContain('11,600.00');
    expect(payload.status).toBe('PAGADO');
  });

  it('omits IVA when the sale is not taxed', () => {
    const payload = generateNotaDeVentaPayload({ title: 'Servicio', amount: 10000, includeIva: false });

    expect(payload.ivaAmount).toBe(0);
    expect(payload.total).toBe(10000);
  });

  it('leaves the RFC absent when none is on file — never the generic XAXX (#179)', () => {
    // The old fallback printed XAXX010101000 (*público en general*) as if it
    // were the party's RFC — an identity the system never established.
    const payload = generateNotaDeVentaPayload({ title: 'Servicio', amount: 500 });

    expect(payload.client.name).toBe('Cliente General');
    expect(payload.client.rfc).toBe('');
    expect(payload.tenant.rfc).toBe('');
  });

  it('shares the receipt over a wa.me link naming the concept', () => {
    const payload = generateNotaDeVentaPayload({
      title: 'Mantenimiento Mensual',
      clientName: 'Carlos López',
      amount: 5000,
    });

    const link = generateReceiptWhatsAppLink(payload, '5512345678');

    expect(link).toContain('https://wa.me/525512345678');
    expect(link).toContain('Mantenimiento%20Mensual');
  });
});

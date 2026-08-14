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
        paid: true,
      },
      { name: 'Agencia Digital MX', rfc: 'ADM180909ABC' }
    );

    expect(payload.tenant.name).toBe('Agencia Digital MX');
    expect(payload.client.name).toBe('Distribuidora del Norte S.A.');
    expect(payload.subtotal).toBe(10000);
    expect(payload.ivaAmount).toBe(1600);
    expect(payload.total).toBe(11600);
    expect(payload.formattedTotal).toContain('11,600.00');
    // `paid: true` is now what earns this; the argument was added here when the
    // unconditional 'PAGADO' default was removed (#252).
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

/**
 * #251 — a milestone amount is already IVA-inclusive.
 *
 * It is a slice of `quotes.total_amount`; the CFDI path recovers the pre-tax
 * base with `treatment.baseRatio` before stamping. Fed to this generator as
 * `amount` (a pre-tax subtotal) another 16% went on top, and the client got a
 * comprobante for $56,515.20 against a $48,720.00 cobro.
 */
describe('a gross amount prints as the total the caller passed', () => {
  it('recovers the base from an IVA-inclusive figure', () => {
    const payload = generateNotaDeVentaPayload({ title: 'Anticipo 50%', totalIncludingIva: 48720 });

    expect(payload.total).toBe(48720);
    expect(payload.subtotal).toBe(42000);
    expect(payload.ivaAmount).toBe(6720);
    expect(payload.formattedTotal).toContain('48,720.00');
  });

  it('never drifts off the figure passed, whatever the rounding', () => {
    // base = 1234.57 / 1.16 = 1064.28448…; re-adding 16% to a rounded base
    // would print 1234.5648 → 1234.56, a centavo under the cobro.
    const payload = generateNotaDeVentaPayload({ title: 'Finiquito', totalIncludingIva: 1234.57 });

    expect(payload.total).toBe(1234.57);
    expect(payload.subtotal + payload.ivaAmount).toBe(1234.57);
  });

  it('leaves a gross figure alone when the sale is untaxed', () => {
    const payload = generateNotaDeVentaPayload({
      title: 'Servicio exento',
      totalIncludingIva: 5000,
      includeIva: false,
    });

    expect(payload.total).toBe(5000);
    expect(payload.subtotal).toBe(5000);
    expect(payload.ivaAmount).toBe(0);
  });

  it('still adds IVA on top of a pre-tax `amount`, as it always did', () => {
    const payload = generateNotaDeVentaPayload({ title: 'Servicio', amount: 1000 });

    expect(payload.total).toBe(1160);
  });
});

/**
 * #252 — the document may not declare a payment nobody made.
 *
 * The status defaulted to 'PAGADO' and the WhatsApp body thanked the client
 * for their payment, for every row the button was enabled on — including a
 * `pending` cobro. Aimed at the tenant's own customer, which is the worst
 * possible audience for a fabricated success.
 */
describe('an unpaid cobro is never described as paid', () => {
  it('defaults to pending rather than PAGADO', () => {
    const payload = generateNotaDeVentaPayload({ title: 'Anticipo', totalIncludingIva: 10000 });

    expect(payload.paid).toBe(false);
    expect(payload.status).toBe('PENDIENTE DE PAGO');
    expect(payload.notes).toMatch(/no es un comprobante de pago/i);
  });

  it('asks for the transfer instead of thanking the client for it', () => {
    const payload = generateNotaDeVentaPayload({
      title: 'Anticipo',
      clientName: 'Carlos López',
      totalIncludingIva: 10000,
    });

    const link = decodeURIComponent(generateReceiptWhatsAppLink(payload, '5512345678'));

    expect(link).not.toMatch(/gracias por tu pago/i);
    expect(link).not.toMatch(/Comprobante de Pago/i);
    expect(link).toMatch(/pendiente de pago/i);
  });

  it('thanks the client only when the caller states the money arrived', () => {
    const payload = generateNotaDeVentaPayload({
      title: 'Anticipo',
      clientName: 'Carlos López',
      totalIncludingIva: 10000,
      paid: true,
    });

    const link = decodeURIComponent(generateReceiptWhatsAppLink(payload, '5512345678'));

    expect(payload.notes).toMatch(/comprobante de pago comercial/i);
    expect(link).toMatch(/gracias por tu pago/i);
  });
});

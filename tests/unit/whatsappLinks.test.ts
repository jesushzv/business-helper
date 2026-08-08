import { describe, it, expect } from 'vitest';
import { generateWhatsAppLink } from '@/lib/whatsappLink';
import { generatePaymentReminderLink } from '@/lib/whatsappReminder';
import { generateReminderBroadcastPayload } from '@/lib/whatsappBroadcast';

describe('WhatsApp 1-Tap Link Generator', () => {
  it('prefixes a 10-digit Mexican number with 52 and encodes the text', () => {
    const link = generateWhatsAppLink('8115551234', 'Hola Don Roberto');

    expect(link).toContain('wa.me/528115551234');
    expect(link).toContain('text=Hola%20Don%20Roberto');
  });

  it('strips spaces, hyphens and the +52 prefix', () => {
    expect(generateWhatsAppLink('+52 81-1555-1234')).toBe('https://wa.me/528115551234');
  });

  it('normalizes the legacy +521 mobile prefix', () => {
    expect(generateWhatsAppLink('5218115551234')).toBe('https://wa.me/528115551234');
  });

  it('returns an empty string rather than a broken link for a missing phone', () => {
    expect(generateWhatsAppLink('')).toBe('');
    expect(generateWhatsAppLink(null)).toBe('');
  });
});

describe('WhatsApp Payment Reminder Links', () => {
  it('builds an overdue reminder carrying the client, pay token and overdue wording', () => {
    const link = generatePaymentReminderLink({
      phone: '8115551234',
      clientName: 'Don Roberto',
      milestoneLabel: 'Anticipo 50%',
      amount: 5000,
      dueDate: '2026-08-15',
      status: 'overdue',
      payToken: 'token_abc123',
      baseUrl: 'https://businesshelper.app',
    });

    expect(link).toContain('wa.me/528115551234');
    expect(link).toContain('Don%20Roberto');
    expect(link).toContain('token_abc123');
    expect(decodeURIComponent(link)).toContain('atrasado');
  });

  it('uses forward-looking wording for an upcoming reminder', () => {
    const link = generatePaymentReminderLink({
      phone: '8115551234',
      clientName: 'Mariana',
      milestoneLabel: 'Finiquito',
      amount: 10000,
      dueDate: '2026-09-02',
      status: 'upcoming_3d',
      payToken: 'token_xyz789',
      baseUrl: 'https://businesshelper.app',
    });

    expect(link).toContain('wa.me/528115551234');
    expect(link).toContain('token_xyz789');
    expect(decodeURIComponent(link)).toContain('vence el 2026-09-02');
  });
});

describe('WhatsApp Reminder Broadcast Payloads', () => {
  it('targets the client number and names the client in the message', () => {
    const payload = generateReminderBroadcastPayload(
      {
        id: 'm1',
        publicToken: 'quote_token_m1',
        label: 'Finiquito',
        amount: 15000,
        due_date: '2026-08-20',
        status: 'pending',
      },
      { name: 'Construcciones MTY', phone: '8119998877' },
      'overdue',
      'https://businesshelper.app'
    );

    expect(payload.phone).toBe('528119998877');
    expect(payload.message).toContain('Construcciones MTY');
    expect(payload.whatsappUrl.startsWith('https://wa.me/528119998877')).toBe(true);
  });

  /**
   * This assertion used to read `/pay/m42` — the milestone id — and passed,
   * which is why #72 shipped: the suite pinned the defect rather than catching
   * it. `/pay/[token]` resolves a quote's public_token, so the id form is a
   * 404 in front of a paying client.
   */
  it('deep-links to the quote public token, never the milestone id', () => {
    const payload = generateReminderBroadcastPayload(
      {
        id: 'm42',
        publicToken: 'quote_token_abc',
        label: 'Anticipo',
        amount: 1000,
        due_date: '2026-08-20',
        status: 'pending',
      },
      { name: 'Cliente', phone: '8119998877' },
      'due_today',
      'https://businesshelper.app'
    );

    expect(payload.paymentUrl).toBe('https://businesshelper.app/pay/quote_token_abc');
    expect(payload.message).toContain('https://businesshelper.app/pay/quote_token_abc');
    expect(payload.message).not.toContain('/pay/m42');
    expect(payload.type).toBe('due_today');
  });

  it('carries no payment link at all when the milestone has no quote token', () => {
    const payload = generateReminderBroadcastPayload(
      {
        id: 'm99',
        publicToken: null,
        label: 'Anticipo',
        amount: 1000,
        due_date: '2026-08-20',
        status: 'pending',
      },
      { name: 'Cliente', phone: '8119998877' },
      'overdue',
      'https://businesshelper.app'
    );

    // A dead link is worse than none: it reads as a broken business.
    expect(payload.paymentUrl).toBeNull();
    expect(payload.message).not.toContain('/pay/');
    expect(payload.message).toContain('saldo pendiente');
  });
});

// @vitest-environment node
//
// Runs without jsdom so `typeof window === 'undefined'` — the branch the
// outbound reminder builders take. That is exactly where the hardcoded origins
// lived: `POST /api/whatsapp/broadcast` never passes a baseUrl, so every
// reminder it sent carried whichever literal the builder defaulted to —
// 'https://business-helper.app' (hyphenated, unowned) or
// 'https://business-helper.vercel.app' (a preview host). #73, and #36 before it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPaymentPublicUrl } from '@/lib/url';
import { formatOutboundReminderPayload } from '@/lib/whatsappOutbound';
import { generatePaymentReminderLink } from '@/lib/whatsappReminder';
import { generateReminderBroadcastPayload } from '@/lib/whatsappBroadcast';

const ENV_KEYS = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_VERCEL_URL', 'VERCEL_URL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe('getPaymentPublicUrl (server-side)', () => {
  it('resolves against NEXT_PUBLIC_APP_URL, the configured origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.app';
    expect(getPaymentPublicUrl('tok_abc123')).toBe('https://businesshelper.app/pay/tok_abc123');
  });

  it('falls back to the Vercel preview origin when no app URL is set', () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = 'preview-abc.vercel.app';
    expect(getPaymentPublicUrl('tok_abc123')).toBe('https://preview-abc.vercel.app/pay/tok_abc123');
  });

  it('yields localhost when unconfigured — never an unowned domain', () => {
    const url = getPaymentPublicUrl('tok_abc123');
    expect(url).toBe('http://localhost:3000/pay/tok_abc123');
    expect(url).not.toContain('business-helper');
  });
});

/**
 * Each builder, called the way its production caller calls it: with no baseUrl.
 * Before this change every one of these emitted a literal host.
 */
describe('Outbound reminder builders resolve the configured origin (#73)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.app';
  });

  it('formatOutboundReminderPayload — the API dispatch path', () => {
    const payload = formatOutboundReminderPayload({
      clientName: 'Construcciones Maya',
      phone: '8115559988',
      amountDue: 15000,
      dueDate: '2026-08-20',
      token: 'tok_abc123',
    });

    expect(payload.payUrl).toBe('https://businesshelper.app/pay/tok_abc123');
    expect(payload.message).toContain('https://businesshelper.app/pay/tok_abc123');
    expect(payload.message).not.toContain('business-helper.app');
  });

  it('generatePaymentReminderLink — the Cobranza card path', () => {
    const link = decodeURIComponent(
      generatePaymentReminderLink({
        phone: '8115559988',
        clientName: 'Cliente',
        milestoneLabel: 'Anticipo',
        amount: 1000,
        dueDate: '2026-08-20',
        status: 'overdue',
        payToken: 'tok_abc123',
      })
    );

    expect(link).toContain('https://businesshelper.app/pay/tok_abc123');
    expect(link).not.toContain('business-helper.vercel.app');
  });

  it('generateReminderBroadcastPayload — the Facturación aviso path', () => {
    const payload = generateReminderBroadcastPayload(
      {
        id: 'm42',
        publicToken: 'tok_abc123',
        label: 'Anticipo',
        amount: 1000,
        due_date: '2026-08-20',
        status: 'pending',
      },
      { name: 'Cliente', phone: '8119998877' },
      'overdue'
    );

    expect(payload.paymentUrl).toBe('https://businesshelper.app/pay/tok_abc123');
    expect(payload.message).not.toContain('business-helper.vercel.app');
    // The id must not appear as the path segment — that is #72.
    expect(payload.message).not.toContain('/pay/m42');
  });
});

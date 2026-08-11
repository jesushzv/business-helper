import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Email is the OTP launch channel (2026-08-11): the issue route resolves the
 * signer's recipient from the channel — `clients.email` on email, the phone on
 * the deprecated sms/whatsapp channels — and both the rate-limit key and the
 * delivery target are that same normalized value. These tests pin the
 * resolution, including the 422s that name the missing field instead of
 * charging a budget or calling a provider.
 */

const deliverOtp = vi.fn();
let channel: string = 'email';

vi.mock('@/lib/otpDelivery', () => ({
  deliverOtp: (...args: unknown[]) => deliverOtp(...args),
  getDeliveryChannel: () => channel,
  isDeliveryConfigured: () => true,
}));

const checkResendBackoff = vi.fn(async (..._args: unknown[]) => ({ allowed: true }));
const reserveOtpSend = vi.fn(async (..._args: unknown[]) => ({ allowed: true, sendId: 'send-1' }));

vi.mock('@/lib/otpRateLimit', async () => {
  // Real normalizers on purpose: the resolution under test is the seam between
  // them and the route, and a stub normalizer would hide a mismatch.
  const actual = await vi.importActual<typeof import('@/lib/otpRateLimit')>('@/lib/otpRateLimit');
  return {
    ...actual,
    checkResendBackoff: (...args: unknown[]) => checkResendBackoff(...args),
    reserveOtpSend: (...args: unknown[]) => reserveOtpSend(...args),
    markOtpSendDeliveryFailed: vi.fn(async () => undefined),
  };
});

const maybeSingle = vi.fn();
const updateEq = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: () => ({ eq: updateEq }),
    }),
  }),
}));

import { POST } from '@/app/api/quotes/public/[token]/otp/route';

function quoteRow(clients: { phone?: string | null; email?: string | null }) {
  return {
    id: 'q-1',
    status: 'sent',
    client_otp_sent_at: null,
    client_otp_verified: false,
    clients,
  };
}

function issueRequest(): [Request, { params: Promise<{ token: string }> }] {
  return [
    new Request('https://app.example.com/api/quotes/public/tok/otp', { method: 'POST' }),
    { params: Promise.resolve({ token: 'tok' }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  channel = 'email';
  deliverOtp.mockResolvedValue({ delivered: true, channel: 'email', devCode: null });
  updateEq.mockResolvedValue({ error: null });
});

describe('POST /api/quotes/public/[token]/otp — recipient resolution by channel', () => {
  it('email channel delivers to the stored email, normalized, and keys the limit on it', async () => {
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: '+528112223344', email: ' Cliente@Empresa.MX ' }),
      error: null,
    });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.channel).toBe('email');
    expect(deliverOtp).toHaveBeenCalledWith('cliente@empresa.mx', expect.any(String));
    expect(checkResendBackoff.mock.calls[0][1]).toEqual({ recipient: 'cliente@empresa.mx' });
    expect(reserveOtpSend.mock.calls[0][1]).toMatchObject({
      recipient: 'cliente@empresa.mx',
      quoteId: 'q-1',
      channel: 'email',
    });
  });

  it('answers 422 CLIENT_EMAIL_MISSING before charging any budget when the client has no email', async () => {
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: '+528112223344', email: null }),
      error: null,
    });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CLIENT_EMAIL_MISSING');
    expect(body.error.message).toContain('correo');
    expect(deliverOtp).not.toHaveBeenCalled();
    expect(reserveOtpSend).not.toHaveBeenCalled();
  });

  it('answers 422 CLIENT_EMAIL_INVALID for a stored address that cannot receive', async () => {
    maybeSingle.mockResolvedValue({
      data: quoteRow({ email: 'no-es-un-correo' }),
      error: null,
    });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CLIENT_EMAIL_INVALID');
    expect(deliverOtp).not.toHaveBeenCalled();
    expect(reserveOtpSend).not.toHaveBeenCalled();
  });

  it('the deprecated sms channel still resolves the phone', async () => {
    channel = 'sms';
    deliverOtp.mockResolvedValue({ delivered: true, channel: 'sms', devCode: null });
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: '+528112223344', email: 'cliente@empresa.mx' }),
      error: null,
    });

    const res = await POST(...issueRequest());

    expect(res.status).toBe(200);
    expect(deliverOtp).toHaveBeenCalledWith('+528112223344', expect.any(String));
    expect(reserveOtpSend.mock.calls[0][1]).toMatchObject({
      recipient: '+528112223344',
      channel: 'sms',
    });
  });

  it('sms with no phone still answers 422 CLIENT_PHONE_MISSING', async () => {
    channel = 'sms';
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: null, email: 'cliente@empresa.mx' }),
      error: null,
    });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CLIENT_PHONE_MISSING');
  });

  it('the dev console channel is email-first, so development exercises the launch path', async () => {
    channel = 'console';
    deliverOtp.mockResolvedValue({ delivered: true, channel: 'console', devCode: '123456' });
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: '+528112223344', email: 'cliente@empresa.mx' }),
      error: null,
    });

    await POST(...issueRequest());

    expect(deliverOtp).toHaveBeenCalledWith('cliente@empresa.mx', expect.any(String));
  });

  it('the console channel falls back to the phone when the client has no email', async () => {
    channel = 'console';
    deliverOtp.mockResolvedValue({ delivered: true, channel: 'console', devCode: '123456' });
    maybeSingle.mockResolvedValue({
      data: quoteRow({ phone: '+528112223344', email: null }),
      error: null,
    });

    await POST(...issueRequest());

    expect(deliverOtp).toHaveBeenCalledWith('+528112223344', expect.any(String));
  });
});

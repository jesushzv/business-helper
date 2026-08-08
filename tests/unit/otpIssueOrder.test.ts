import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #39 — a failed OTP send must not invalidate a code that already arrived.
 *
 * The issue route used to rotate the stored digest (and restart the cooldown)
 * BEFORE attempting delivery, so a provider failure on a resend destroyed the
 * code the signer was already holding. The order is now deliver → store; these
 * tests pin it by asserting when the quotes update runs relative to delivery.
 */

const deliverOtp = vi.fn();
vi.mock('@/lib/otpDelivery', () => ({
  deliverOtp: (...args: unknown[]) => deliverOtp(...args),
  getDeliveryChannel: () => 'sms',
  isDeliveryConfigured: () => true,
}));

vi.mock('@/lib/otpRateLimit', () => ({
  normalizeOtpRecipient: (phone: string) => `+52${phone}`,
  reserveOtpSend: async () => ({ allowed: true }),
}));

const maybeSingle = vi.fn();
const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle } ) }),
      update,
    }),
  }),
}));

import { POST } from '@/app/api/quotes/public/[token]/otp/route';

const QUOTE_ROW = {
  id: 'q-1',
  status: 'sent',
  client_otp_sent_at: null,
  client_otp_verified: false,
  clients: { phone: '8112223344' },
};

function issueRequest(): [Request, { params: Promise<{ token: string }> }] {
  return [
    new Request('https://app.example.com/api/quotes/public/tok/otp', { method: 'POST' }),
    { params: Promise.resolve({ token: 'tok' }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: { ...QUOTE_ROW }, error: null });
  updateEq.mockResolvedValue({ error: null });
});

describe('POST /api/quotes/public/[token]/otp — deliver before store', () => {
  it('does not touch the stored digest when delivery fails', async () => {
    deliverOtp.mockResolvedValue({ delivered: false, channel: 'sms', devCode: null, error: 'Proveedor caído' });

    const res = await POST(...issueRequest());

    expect(res.status).toBe(502);
    // The whole point of #39: a failed send must leave the previous code —
    // and the cooldown timestamp — exactly as they were.
    expect(update).not.toHaveBeenCalled();
  });

  it('stores the digest only after delivery succeeds', async () => {
    const callOrder: string[] = [];
    deliverOtp.mockImplementation(async () => {
      callOrder.push('deliver');
      return { delivered: true, channel: 'sms', devCode: null };
    });
    update.mockImplementation(() => {
      callOrder.push('store');
      return { eq: updateEq };
    });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(true);
    expect(callOrder).toEqual(['deliver', 'store']);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        client_otp_hash: expect.any(String),
        client_otp_attempts: 0,
      })
    );
  });

  it('reports an honest failure when the code was delivered but could not be stored', async () => {
    deliverOtp.mockResolvedValue({ delivered: true, channel: 'sms', devCode: null });
    updateEq.mockResolvedValue({ error: { message: 'db down' } });

    const res = await POST(...issueRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    // The signer holds a code that verifies against nothing; the message must
    // direct them to request a new one, not claim the send worked.
    expect(body.error.code).toBe('OTP_STORE_FAILED');
    expect(body.error.message).toContain('Solicite uno nuevo');
  });
});

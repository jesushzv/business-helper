import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateOTP,
  hashOTP,
  verifyStoredOTP,
  otpExpiryDate,
  generateDigitalSeal,
  verifyDigitalSeal,
  OTP_MAX_ATTEMPTS,
} from '@/lib/otpSeal';
import { verifyStripeWebhookSignature, signStripePayload } from '@/lib/stripeWebhook';
import { handleStripeWebhookEvent } from '@/lib/stripe';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression tests for the four P0 findings. Each block asserts the specific
 * exploit is closed, so a refactor that reintroduces one fails here.
 */

const TEST_SECRET = 'test-otp-secret-at-least-32-characters-long';

beforeAll(() => {
  process.env.OTP_SECRET = TEST_SECRET;
});

describe('P0-1: OTP e-signature is server-authoritative', () => {
  const token = 'quote-token-abc';

  function issue(code: string, expiresAt: Date = otpExpiryDate()) {
    return { hash: hashOTP(code, token), expiresAt, attempts: 0 };
  }

  it('generates a 6-digit numeric code', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateOTP()).toMatch(/^\d{6}$/);
    }
  });

  it('accepts the issued code', () => {
    const result = verifyStoredOTP('123456', token, issue('123456'));
    expect(result.success).toBe(true);
  });

  it('rejects a code that was not issued', () => {
    const result = verifyStoredOTP('999999', token, issue('123456'));
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('binds a code to one quote, so a digest cannot be replayed on another', () => {
    const state = issue('123456');
    // Same code, different quote token: the stored digest must not match.
    const result = verifyStoredOTP('123456', 'a-different-token', state);
    expect(result.success).toBe(false);
  });

  it('rejects when no code has been issued', () => {
    const result = verifyStoredOTP('123456', token, {
      hash: null,
      expiresAt: null,
      attempts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an expired code without consuming an attempt', () => {
    const expired = issue('123456', new Date(Date.now() - 1000));
    const result = verifyStoredOTP('123456', token, expired);
    expect(result.success).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.attempts).toBe(0);
  });

  it('locks out after the attempt cap', () => {
    const state = { ...issue('123456'), attempts: OTP_MAX_ATTEMPTS };
    const result = verifyStoredOTP('123456', token, state);
    expect(result.success).toBe(false);
    expect(result.error).toContain('máximo');
  });

  it('stores only a digest, never the code itself', () => {
    const state = issue('123456');
    expect(state.hash).not.toContain('123456');
    expect(state.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exposes no parameter that lets a caller supply the expected code', () => {
    // The exploit was POST {otpCode, serverOtp} with both set equal. The
    // verifier takes server-held state, so a caller-controlled object is the
    // only thing that could stand in — and it must carry a valid digest.
    const forged = { hash: 'attacker-controlled', expiresAt: otpExpiryDate(), attempts: 0 };
    expect(verifyStoredOTP('123456', token, forged).success).toBe(false);
  });

  it('produces a keyed seal that changes with the secret', () => {
    const payload = {
      contractId: 'c_123',
      clientName: 'Juan Pérez',
      totalAmount: 15000,
      timestamp: '2026-08-01T12:00:00Z',
      otpCode: '123456',
    };

    const seal = generateDigitalSeal(payload);
    expect(seal).toMatch(/^[0-9a-f]{64}$/);
    expect(generateDigitalSeal(payload)).toBe(seal);
    expect(verifyDigitalSeal(payload, seal)).toBe(true);

    process.env.OTP_SECRET = 'a-completely-different-secret-32-chars-x';
    expect(generateDigitalSeal(payload)).not.toBe(seal);
    process.env.OTP_SECRET = TEST_SECRET;
  });

  it('detects a tampered amount in a sealed payload', () => {
    const payload = {
      contractId: 'c_123',
      clientName: 'Juan Pérez',
      totalAmount: 15000,
      timestamp: '2026-08-01T12:00:00Z',
      otpCode: '123456',
    };
    const seal = generateDigitalSeal(payload);
    expect(verifyDigitalSeal({ ...payload, totalAmount: 1 }, seal)).toBe(false);
  });
});

describe('P0-2: Stripe webhook signature verification', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: { object: { metadata: { organization_id: 'org_123' }, status: 'active' } },
  });

  it('accepts a correctly signed payload', () => {
    const header = signStripePayload(body, secret);
    expect(verifyStripeWebhookSignature(body, header, secret).valid).toBe(true);
  });

  it('rejects an unsigned request — the original exploit', () => {
    expect(verifyStripeWebhookSignature(body, null, secret).valid).toBe(false);
  });

  it('rejects a payload tampered with after signing', () => {
    const header = signStripePayload(body, secret);
    const tampered = body.replace('org_123', 'org_victim');
    expect(verifyStripeWebhookSignature(tampered, header, secret).valid).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const header = signStripePayload(body, 'whsec_attacker_secret');
    expect(verifyStripeWebhookSignature(body, header, secret).valid).toBe(false);
  });

  it('rejects a replayed request outside the tolerance window', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = signStripePayload(body, secret, old);
    expect(verifyStripeWebhookSignature(body, header, secret, 300).valid).toBe(false);
  });

  it('accepts a replay inside the tolerance window', () => {
    const recent = Math.floor(Date.now() / 1000) - 60;
    const header = signStripePayload(body, secret, recent);
    expect(verifyStripeWebhookSignature(body, header, secret, 300).valid).toBe(true);
  });

  it('rejects when no endpoint secret is configured', () => {
    const header = signStripePayload(body, secret);
    expect(verifyStripeWebhookSignature(body, header, undefined).valid).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    expect(verifyStripeWebhookSignature(body, 'garbage', secret).valid).toBe(false);
    expect(verifyStripeWebhookSignature(body, 't=123', secret).valid).toBe(false);
  });

  it('treats a subscription deletion as canceled regardless of reported status', () => {
    const result = handleStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { organization_id: 'org_123' }, status: 'active' } },
    });
    expect(result.status).toBe('canceled');
  });
});

describe('P0-3: no anon-readable RLS policies remain', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const hardening = readFileSync(
    join(migrationsDir, '20260806120000_security_hardening.sql'),
    'utf8'
  );

  it('drops the tautological public quote policy', () => {
    expect(hardening).toContain('DROP POLICY IF EXISTS "Public read quotes via public_token"');
  });

  it('drops the unscoped public contract policy', () => {
    expect(hardening).toContain('DROP POLICY IF EXISTS "Public read contracts for OTP signing"');
  });

  it('removes plaintext OTP storage from contracts', () => {
    expect(hardening).toContain('DROP COLUMN IF EXISTS client_otp_code');
  });

  it('creates no new policy granting the anon role table access', () => {
    // A CREATE POLICY ... TO anon in this migration would reopen the hole.
    expect(/CREATE POLICY[\s\S]*?TO anon/i.test(hardening)).toBe(false);
  });
});

describe('P0-4: no hardcoded CLABE in live payment paths', () => {
  const HARDCODED_CLABE = '012180001234567890';

  const liveFiles = [
    'app/api/receivables/public/[token]/route.ts',
    'app/pay/[token]/page.tsx',
  ];

  it.each(liveFiles)('%s serves no hardcoded CLABE', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).not.toContain(HARDCODED_CLABE);
  });

  it('constrains stored CLABEs to 18 digits', () => {
    const hardening = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260806120000_security_hardening.sql'),
      'utf8'
    );
    expect(hardening).toContain('bank_clabe');
    expect(hardening).toContain("'^[0-9]{18}$'");
  });
});

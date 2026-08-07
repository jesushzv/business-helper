import { describe, it, expect } from 'vitest';
import { generateDigitalSeal, verifyDigitalSeal, otpExpiryDate, OTP_MAX_ATTEMPTS } from '@/lib/otpSeal';

const payload = {
  contractId: 'c_123',
  clientName: 'Juan Pérez',
  totalAmount: 15000,
  timestamp: '2026-08-01T12:00:00Z',
  otpCode: '123456',
};

describe('Digital cryptoseal', () => {
  it('is deterministic for identical input, so a stored seal can be re-verified', () => {
    const seal = generateDigitalSeal(payload);

    expect(seal).toMatch(/^[a-f0-9]{64}$/);
    expect(generateDigitalSeal(payload)).toBe(seal);
    expect(verifyDigitalSeal(payload, seal)).toBe(true);
  });

  it('changes when any signed field changes', () => {
    const seal = generateDigitalSeal(payload);

    expect(generateDigitalSeal({ ...payload, totalAmount: 15001 })).not.toBe(seal);
    expect(verifyDigitalSeal({ ...payload, clientName: 'Otro' }, seal)).toBe(false);
  });
});

describe('OTP policy constants', () => {
  it('caps signature attempts at three', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(3);
  });

  it('expires a code in the future relative to its issue time', () => {
    const issuedAt = new Date('2026-08-01T12:00:00Z');

    expect(otpExpiryDate(issuedAt).getTime()).toBeGreaterThan(issuedAt.getTime());
  });
});

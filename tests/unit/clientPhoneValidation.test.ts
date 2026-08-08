import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeClientPhone } from '@/lib/phoneValidator';
import { formatE164MexicanPhone } from '@/lib/whatsappOutbound';
import { normalizeOtpRecipient } from '@/lib/otpRateLimit';

/**
 * #40 — `clients.phone` is the column an e-signature is delivered to, and
 * nothing validated it on write. `POST /api/clients` and
 * `PATCH /api/clients/[id]` only called `.trim()`, so "llamar a la oficina",
 * a 7-digit local number or an extension persisted, then surfaced days later
 * as a 502 from the OTP route phrased as a provider failure.
 */

describe('normalizeClientPhone — the write path (#40)', () => {
  it('keeps the phone optional: absent, null and blank all store null', () => {
    for (const input of [undefined, null, '', '   ']) {
      const result = normalizeClientPhone(input);
      expect(result.error).toBeUndefined();
      expect(result.value).toBeNull();
    }
  });

  it('accepts the formats a Mexican user actually types, and stores one of them', () => {
    for (const input of [
      '8112345678',
      '(81) 1234-5678',
      '81-1234-5678',
      '+52 81 1234 5678',
      '5281 1234 5678',
    ]) {
      const result = normalizeClientPhone(input);
      expect(result.error, `${input} should be accepted`).toBeUndefined();
      // One canonical stored form, so the two downstream formatters cannot
      // disagree about the same client.
      expect(result.value).toBe('8112345678');
    }
  });

  it('rejects the values that used to persist, with a Spanish message', () => {
    for (const input of ['llamar a la oficina', '1234567', '81 1234 5678 ext 12', 'N/A', '+52']) {
      const result = normalizeClientPhone(input);
      expect(result.value, `${input} must not be stored`).toBeNull();
      expect(result.error, `${input} must be rejected`).toBeTruthy();
      // Mexican Spanish, and it says what the number is for (hard rule 8).
      expect(result.error).toContain('10 dígitos');
      expect(result.error).not.toMatch(/[a-z]+ing\b|invalid|phone/i);
    }
  });
});

describe('the routes actually call it', () => {
  const post = readFileSync(join(process.cwd(), 'app/api/clients/route.ts'), 'utf8');
  const patch = readFileSync(join(process.cwd(), 'app/api/clients/[id]/route.ts'), 'utf8');

  it('POST /api/clients validates and stores the normalized value', () => {
    expect(post).toContain('normalizeClientPhone');
    expect(post).toContain("code: 'INVALID_PHONE'");
    // The pre-#40 line. Storing the raw trim is the defect itself.
    expect(post).not.toContain('phone: phone ? String(phone).trim() : null');
  });

  it('PATCH /api/clients/[id] validates and stores the normalized value', () => {
    expect(patch).toContain('normalizeClientPhone');
    expect(patch).toContain("code: 'INVALID_PHONE'");
    expect(patch).not.toMatch(/updates\.phone = phone;/);
  });

  it('PATCH only rejects when the caller is setting the phone', () => {
    // A PATCH of `notes` on a client whose stored phone predates this
    // validation must still succeed; the guard is keyed on `phone !== undefined`.
    expect(patch).toMatch(/phone !== undefined && phoneNormalized\.error/);
  });
});

describe('formatE164MexicanPhone fails closed (#40)', () => {
  it('still formats the two shapes it always handled', () => {
    expect(formatE164MexicanPhone('8115559988')).toBe('+528115559988');
    expect(formatE164MexicanPhone('528115559988')).toBe('+528115559988');
  });

  it('normalizes the legacy +521 mobile form, as generateWhatsAppLink always did', () => {
    // The same stored number used to yield a working wa.me link and a
    // malformed provider recipient.
    expect(formatE164MexicanPhone('5218115559988')).toBe('+528115559988');
  });

  it('returns empty for anything else instead of prefixing a plus and sending it', () => {
    for (const input of ['', '1234567', '81155599881234567', 'llamar a la oficina']) {
      expect(formatE164MexicanPhone(input)).toBe('');
    }
  });

  it('no longer waves an 11-digit number through the OTP recipient check', () => {
    // `\+[0-9]{10,15}` accepted `+81155599881` when the formatter passed
    // arbitrary digit counts through. Both layers now agree it is unusable.
    expect(formatE164MexicanPhone('81155599881')).toBe('');
    expect(normalizeOtpRecipient('81155599881')).toBeNull();
  });

  it('accepts a valid number through the OTP recipient check', () => {
    expect(normalizeOtpRecipient('8115559988')).toBe('+528115559988');
  });
});

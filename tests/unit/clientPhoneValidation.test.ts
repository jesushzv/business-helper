import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeClientPhone, validatePhone } from '@/lib/phoneValidator';
import { formatE164Phone } from '@/lib/whatsappOutbound';
import { normalizeOtpRecipient } from '@/lib/otpRateLimit';
import { generateWhatsAppLink } from '@/lib/whatsappLink';

/**
 * #40 — `clients.phone` is the column an e-signature is delivered to, and
 * nothing validated it on write. `POST /api/clients` and
 * `PATCH /api/clients/[id]` only called `.trim()`, so "llamar a la oficina",
 * a 7-digit local number or an extension persisted, then surfaced days later
 * as a 502 from the OTP route phrased as a provider failure.
 *
 * #94 — the stored form moved from 10 bare digits to E.164, so a non-Mexican
 * client can be reached at all. The old form could not represent one: every
 * consumer re-derived `+52`, so a US number was dialed as `+52`+its digits.
 */

describe('normalizeClientPhone — the write path (#40, #94)', () => {
  it('keeps the phone optional: absent, null and blank all store null', () => {
    for (const input of [undefined, null, '', '   ']) {
      const result = normalizeClientPhone(input);
      expect(result.error).toBeUndefined();
      expect(result.value).toBeNull();
    }
  });

  it('accepts the formats a Mexican user actually types, and stores E.164', () => {
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
      expect(result.value).toBe('+528112345678');
    }
  });

  it('still accepts the retired +521 Mexican mobile form', () => {
    // Mexico dropped the `1` in 2019 and libphonenumber rejects it outright,
    // but this repo has always normalized it — it arrives from old CRM exports
    // and pasted contact cards. Losing it would silently break those inputs.
    for (const input of ['5218115559988', '+5218115559988', '+52 1 811 555 9988']) {
      expect(normalizeClientPhone(input).value, input).toBe('+528115559988');
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

describe('international numbers are in scope (#94)', () => {
  it('accepts a number with an explicit country code and keeps that country', () => {
    // The country code the tenant typed is authoritative — never re-derived.
    expect(normalizeClientPhone('+1 212 555 1234').value).toBe('+12125551234');
    expect(normalizeClientPhone('+44 20 7946 0958').value).toBe('+442079460958');
    expect(normalizeClientPhone('+34 600 000 000').value).toBe('+34600000000');
    expect(normalizeClientPhone('+57 301 234 5678').value).toBe('+573012345678');
  });

  it('honours an explicit defaultCountry for bare national digits', () => {
    expect(normalizeClientPhone('2125551234', 'US').value).toBe('+12125551234');
    // The same digits with the Mexican default are not a valid MX number.
    expect(normalizeClientPhone('2125551234', 'MX').value).toBeNull();
  });

  it('rejects foreign 10-digit numbers that the old regex dialed as +52', () => {
    // The whole of #94's reported harm: `2125551234` passed `^\d{10}$` and
    // became `+522125551234`, a real Mexican number belonging to a stranger.
    // Mexico's numbering plan rules these out without anyone picking a country.
    for (const input of ['2125551234', '3105551234', '2065551234', '2079460958']) {
      const result = normalizeClientPhone(input);
      expect(result.value, `${input} must not be stored as Mexican`).toBeNull();
      expect(result.error).toBeTruthy();
    }
  });

  it('documents the residue: a foreign number that is also a valid MX number', () => {
    // Not a bug to fix at this layer — `4155551234` is a valid Mexican number
    // as well as a San Francisco one, and nothing but asking can tell them
    // apart. This is what the form's country selector is for. Pinned so the
    // limitation is visible rather than assumed away.
    expect(normalizeClientPhone('4155551234').value).toBe('+524155551234');
    expect(normalizeClientPhone('4155551234', 'US').value).toBe('+14155551234');
  });

  it('rejects a country code that does not exist', () => {
    for (const input of ['+999 555 1234', '+0 555 12345']) {
      expect(normalizeClientPhone(input).value, input).toBeNull();
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

describe('formatE164Phone fails closed (#40) and no longer assumes Mexico (#94)', () => {
  it('passes a stored E.164 value through unchanged, whatever the country', () => {
    for (const stored of ['+528115559988', '+12125551234', '+442079460958']) {
      expect(formatE164Phone(stored), stored).toBe(stored);
    }
  });

  it('still reads the pre-backfill shapes, since a deploy can outrun a migration', () => {
    expect(formatE164Phone('8115559988')).toBe('+528115559988');
    expect(formatE164Phone('528115559988')).toBe('+528115559988');
    // The same stored number used to yield a working wa.me link and a
    // malformed provider recipient.
    expect(formatE164Phone('5218115559988')).toBe('+528115559988');
  });

  it('returns empty for anything else instead of prefixing a plus and sending it', () => {
    for (const input of ['', '1234567', '81155599881234567', 'llamar a la oficina']) {
      expect(formatE164Phone(input)).toBe('');
    }
  });

  it('no longer waves an 11-digit number through the OTP recipient check', () => {
    // `\+[0-9]{10,15}` accepted `+81155599881` when the formatter passed
    // arbitrary digit counts through. Both layers now agree it is unusable.
    expect(formatE164Phone('81155599881')).toBe('');
    expect(normalizeOtpRecipient('81155599881')).toBeNull();
  });

  it('accepts a valid number through the OTP recipient check, MX or not', () => {
    expect(normalizeOtpRecipient('8115559988')).toBe('+528115559988');
    expect(normalizeOtpRecipient('+12125551234')).toBe('+12125551234');
    // One handset, one rate-limit budget, however the row happens to spell it.
    expect(normalizeOtpRecipient('+52 811 555 9988')).toBe(normalizeOtpRecipient('8115559988'));
  });
});

describe('generateWhatsAppLink does not re-derive a country code (#94)', () => {
  it('keeps a foreign stored number foreign', () => {
    // The bug this guards: prefixing 52 onto an already-international value,
    // producing wa.me/5212125551234 for a New York client.
    expect(generateWhatsAppLink('+12125551234')).toBe('https://wa.me/12125551234');
    expect(generateWhatsAppLink('+442079460958')).toBe('https://wa.me/442079460958');
  });

  it('keeps a foreign number whose E.164 is exactly 10 digits long', () => {
    // The case that actually discriminates. `+1…` and `+44…` are 11 and 12
    // digits, which no legacy branch rewrites — so asserting on those alone
    // passes even with the `+` check deleted, and proves nothing. Denmark and
    // Iceland total ten digits, which is precisely the length the pre-#94 code
    // read as "bare Mexican national number" and prefixed with 52.
    // Verified by planting `isE164 = false` and watching these two go red.
    expect(generateWhatsAppLink('+4520123456')).toBe('https://wa.me/4520123456');
    expect(generateWhatsAppLink('+3546123456')).toBe('https://wa.me/3546123456');
  });

  it('still handles the pre-backfill Mexican shapes', () => {
    expect(generateWhatsAppLink('8115551234')).toBe('https://wa.me/528115551234');
    expect(generateWhatsAppLink('+52 81-1555-1234')).toBe('https://wa.me/528115551234');
    expect(generateWhatsAppLink('5218115551234')).toBe('https://wa.me/528115551234');
    expect(generateWhatsAppLink('+5218115551234')).toBe('https://wa.me/528115551234');
  });

  it('agrees with the stored value the write path produced', () => {
    // The #40 class of defect was these two disagreeing about one client.
    for (const typed of ['8115559988', '+52 811 555 9988', '+1 212 555 1234']) {
      const stored = normalizeClientPhone(typed).value as string;
      expect(stored).toBeTruthy();
      expect(generateWhatsAppLink(stored)).toBe(`https://wa.me/${stored.slice(1)}`);
      expect(formatE164Phone(stored)).toBe(stored);
    }
  });
});

describe('validatePhone returns E.164 for the register form', () => {
  it('reports validity and the canonical value', () => {
    expect(validatePhone('8112345678')).toEqual({ isValid: true, phone: '+528112345678' });
    const bad = validatePhone('123');
    expect(bad.isValid).toBe(false);
    expect(bad.phone).toBe('');
    expect(bad.error).toBeTruthy();
  });
});

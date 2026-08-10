import { describe, it, expect } from 'vitest';
import { validatePhone } from '@/lib/phoneValidator';

/**
 * `validatePhone` returns the **E.164** form since #94. It used to return 10
 * bare digits and leave every consumer to re-derive `+52`, which is how the
 * same stored number produced a working wa.me link and a malformed provider
 * recipient (#40) — and why a foreign number could not be stored at all.
 */
describe('Phone validator — Mexican default, international accepted', () => {
  it('should validate plain 10-digit phone number (8112345678)', () => {
    const result = validatePhone('8112345678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('+528112345678');
  });

  it('should format and validate formatted phone number ((81) 1234-5678)', () => {
    const result = validatePhone('(81) 1234-5678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('+528112345678');
  });

  it('should accept the +52 country code without doubling it (+52 81 1234 5678)', () => {
    const result = validatePhone('+52 81 1234 5678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('+528112345678');
  });

  it('should accept a number from another country when its code is given', () => {
    const result = validatePhone('+1 212 555 1234');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('+12125551234');
  });

  it('should honour an explicit default country for bare national digits', () => {
    expect(validatePhone('2125551234', 'US').phone).toBe('+12125551234');
  });

  it('should reject invalid short phone numbers', () => {
    const result = validatePhone('12345');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('10 dígitos');
  });

  it('should reject empty or missing phone inputs', () => {
    const result = validatePhone('');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('obligatorio');
  });

  it('returns no value at all when invalid, rather than a partial one', () => {
    // It used to return the stripped digits alongside isValid:false, which is
    // an unusable number wearing the shape of a usable one.
    expect(validatePhone('12345').phone).toBe('');
  });
});

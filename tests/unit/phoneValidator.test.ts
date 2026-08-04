import { describe, it, expect } from 'vitest';
import { validatePhone } from '@/lib/phoneValidator';

describe('Mexican 10-digit Phone Validator Engine', () => {
  it('should validate plain 10-digit phone number (8112345678)', () => {
    const result = validatePhone('8112345678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('8112345678');
  });

  it('should format and validate formatted phone number ((81) 1234-5678)', () => {
    const result = validatePhone('(81) 1234-5678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('8112345678');
  });

  it('should strip country code +52 prefix from 12-digit input (+52 81 1234 5678)', () => {
    const result = validatePhone('+52 81 1234 5678');
    expect(result.isValid).toBe(true);
    expect(result.phone).toBe('8112345678');
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
});

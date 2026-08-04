import { describe, it, expect } from 'vitest';
import { validateRFC } from '@/lib/rfcValidator';

describe('RFC Modulo-11 Syntax & Check-Digit Validation', () => {
  it('should validate valid Persona Moral RFC (12 chars: ABC120315HD9)', () => {
    const result = validateRFC('ABC120315HD9');
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('moral');
    expect(result.rfc).toBe('ABC120315HD9');
  });

  it('should validate valid Persona Física RFC (13 chars: GORM850101789)', () => {
    const result = validateRFC('GORM850101789');
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('fisica');
    expect(result.rfc).toBe('GORM850101789');
  });

  it('should reject RFC that is too short', () => {
    const result = validateRFC('ABC123');
    expect(result.isValid).toBe(false);
    expect(result.type).toBeNull();
    expect(result.error).toContain('Formato de RFC inválido');
  });

  it('should reject RFC with invalid special characters', () => {
    const result = validateRFC('ABC$120315HD9');
    expect(result.isValid).toBe(false);
    expect(result.type).toBeNull();
  });

  it('should trim and uppercase lowercase valid RFC', () => {
    const result = validateRFC('  abc120315hd9  ');
    expect(result.isValid).toBe(true);
    expect(result.rfc).toBe('ABC120315HD9');
  });

  it('should reject empty or non-string inputs', () => {
    const result = validateRFC('');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('no puede estar vacío');
  });
});

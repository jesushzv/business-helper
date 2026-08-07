import { describe, it, expect } from 'vitest';
import {
  normalizeClabe,
  formatClabe,
  isValidClabeLength,
  hasValidClabeCheckDigit,
} from '@/lib/clabe';

/**
 * The CLABE decides where a tenant's customers send money, so the rules that
 * validate it are consolidated here rather than duplicated across the
 * onboarding form, the settings card and the organization API.
 */

const VALID = '012180001234567899'; // checksum-correct
const WRONG_CHECK_DIGIT = '012180001234567890'; // same account, last digit off by one

describe('normalizeClabe', () => {
  it('strips spaces and non-digits', () => {
    expect(normalizeClabe('0121 8000 1234 5678 99')).toBe(VALID);
    expect(normalizeClabe('0121-8000-1234-5678-99')).toBe(VALID);
  });

  it('caps at 18 digits so a paste cannot overflow the field', () => {
    expect(normalizeClabe('01218000123456789912345')).toBe(VALID);
  });

  it('returns an empty string for input with no digits', () => {
    expect(normalizeClabe('abc')).toBe('');
  });
});

describe('formatClabe', () => {
  it('groups digits in fours with no trailing space', () => {
    expect(formatClabe(VALID)).toBe('0121 8000 1234 5678 99');
  });

  it('formats a partial entry without padding', () => {
    expect(formatClabe('01218')).toBe('0121 8');
  });
});

describe('isValidClabeLength', () => {
  it('accepts exactly 18 digits, formatted or not', () => {
    expect(isValidClabeLength(VALID)).toBe(true);
    expect(isValidClabeLength('0121 8000 1234 5678 99')).toBe(true);
  });

  it('rejects anything shorter', () => {
    expect(isValidClabeLength('01218000123456789')).toBe(false);
    expect(isValidClabeLength('')).toBe(false);
  });
});

describe('hasValidClabeCheckDigit', () => {
  it('accepts a checksum-correct CLABE', () => {
    expect(hasValidClabeCheckDigit(VALID)).toBe(true);
    expect(hasValidClabeCheckDigit('0121 8000 1234 5678 99')).toBe(true);
  });

  it('rejects a single wrong check digit — the common typo', () => {
    expect(hasValidClabeCheckDigit(WRONG_CHECK_DIGIT)).toBe(false);
  });

  it('catches a transposition the length check cannot', () => {
    // 5678 -> 5687, same digits, different account.
    expect(hasValidClabeCheckDigit('012180001234568799')).toBe(false);
  });

  it('rejects anything that is not 18 digits', () => {
    expect(hasValidClabeCheckDigit('01218000123456789')).toBe(false);
  });
});

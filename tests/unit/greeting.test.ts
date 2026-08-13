import { describe, it, expect } from 'vitest';
import { greetingFirstName } from '@/lib/greeting';

/**
 * The dashboard's welcome banner greets by first name. Splitting on the first
 * word alone rendered "¡Hola, Don!" for the demo persona "Don Roberto" — an
 * honorific with its name cut off — and would do the same to any tenant whose
 * recorded name starts with a courtesy title ("Lic. Mariana Torres" → "Lic.").
 */
describe('greetingFirstName', () => {
  it('keeps an honorific attached to the name it belongs to', () => {
    expect(greetingFirstName('Don Roberto')).toBe('Don Roberto');
    expect(greetingFirstName('Don Roberto García')).toBe('Don Roberto');
    expect(greetingFirstName('Doña María Pérez')).toBe('Doña María');
    expect(greetingFirstName('Lic. Mariana Torres')).toBe('Lic. Mariana');
    expect(greetingFirstName('Ing Carlos Ruiz')).toBe('Ing Carlos');
  });

  it('takes the first name when there is no honorific', () => {
    expect(greetingFirstName('Roberto Gómez')).toBe('Roberto');
    expect(greetingFirstName('Mariana')).toBe('Mariana');
  });

  it('never greets with a bare honorific: a lone title is used as typed', () => {
    // A user whose whole recorded name is "Don" gave us nothing better.
    expect(greetingFirstName('Don')).toBe('Don');
  });

  it('answers null for nothing, so the caller can fall back honestly', () => {
    expect(greetingFirstName(null)).toBeNull();
    expect(greetingFirstName(undefined)).toBeNull();
    expect(greetingFirstName('   ')).toBeNull();
  });

  it('does not mistake a real name that resembles a title prefix', () => {
    // "Dora" and "Donaldo" must not match dr./don.
    expect(greetingFirstName('Dora Martínez')).toBe('Dora');
    expect(greetingFirstName('Donaldo Colosio')).toBe('Donaldo');
  });
});

import { RFCValidationResult } from '@/types';

/**
 * The two RFC shapes, and the single source of truth for both (#322 item 1).
 *
 * `lib/facturapi.ts` used to carry its own `RFC_PATTERN` — their union, spelled
 * `{3,4}` — enforced on a different path: this module gates *entry* (the client
 * form), that one gates *stamping*. Two live copies of one rule drift, and the
 * drift is invisible until it costs a stamp: a client accepted at entry that
 * the PAC path then rejects, or the reverse. `RFC_PATTERN` is now derived from
 * these, so a change here reaches both paths by construction.
 *
 * Persona Moral: 12 characters (e.g. ABC120315HD9)
 * Persona Física: 13 characters (e.g. GORM850101789)
 */
export const RFC_MORAL_PATTERN = /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/;
export const RFC_FISICA_PATTERN = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

/**
 * Validates Mexican Taxpayer Identification Number (RFC).
 */
export function validateRFC(rfc: string): RFCValidationResult {
  if (!rfc || typeof rfc !== 'string') {
    return { isValid: false, type: null, error: 'El RFC no puede estar vacío.' };
  }

  const cleaned = rfc.trim().toUpperCase();
  const regexMoral = RFC_MORAL_PATTERN;
  const regexFisica = RFC_FISICA_PATTERN;

  if (regexMoral.test(cleaned)) {
    return { isValid: true, type: 'moral', rfc: cleaned };
  } else if (regexFisica.test(cleaned)) {
    return { isValid: true, type: 'fisica', rfc: cleaned };
  }

  return {
    isValid: false,
    type: null,
    error: 'Formato de RFC inválido. Debe contener 12 caracteres (Moral) o 13 (Física).',
  };
}

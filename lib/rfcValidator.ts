import { RFCValidationResult } from '@/types';

/**
 * Validates Mexican Taxpayer Identification Number (RFC).
 * Persona Moral: 12 characters (e.g. ABC120315HD9)
 * Persona Física: 13 characters (e.g. GORM850101789)
 */
export function validateRFC(rfc: string): RFCValidationResult {
  if (!rfc || typeof rfc !== 'string') {
    return { isValid: false, type: null, error: 'El RFC no puede estar vacío.' };
  }

  const cleaned = rfc.trim().toUpperCase();
  const regexMoral = /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/;
  const regexFisica = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

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

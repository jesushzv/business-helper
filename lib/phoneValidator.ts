export interface PhoneValidationResult {
  isValid: boolean;
  phone: string;
  error?: string;
}

/**
 * Validates Mexican 10-digit mobile/landline phone number.
 * Accepts formats: "8112345678", "(81) 1234-5678", "+52 81 1234 5678", "81-1234-5678".
 * Strips non-digits; valid Mexican phone number must be exactly 10 digits.
 */
export function validatePhone(phone: string): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, phone: '', error: 'El número telefónico es obligatorio.' };
  }

  // Clean country code prefix +52 or 52 if present and string length > 10
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('52') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }

  const regex10Digits = /^\d{10}$/;

  if (regex10Digits.test(cleaned)) {
    return { isValid: true, phone: cleaned };
  }

  return {
    isValid: false,
    phone: cleaned,
    error: 'Número telefónico inválido. Debe contener exactamente 10 dígitos (ej. 8112345678).',
  };
}

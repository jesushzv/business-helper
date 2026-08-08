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

export interface NormalizedPhone {
  /** The 10-digit value to store, or null when no phone was supplied. */
  value: string | null;
  /** Spanish message for the caller to return with a 400; absent when valid. */
  error?: string;
}

/**
 * Validates and normalizes a phone number on the way into `clients.phone`.
 *
 * Shared by `POST /api/clients` and `PATCH /api/clients/[id]` so the two agree
 * — before #40 neither validated at all, and the column a signature is
 * delivered to accepted any string that survived `.trim()`.
 *
 * A phone remains **optional**: absent, null and empty all normalize to null.
 * What is rejected is a value that is present and unusable, because storing
 * one converts a correctable typo at the point of entry into a 502 from the
 * OTP route days later, phrased as though the provider were at fault.
 *
 * Normalizing to 10 bare digits is deliberate: `formatE164MexicanPhone` and
 * `generateWhatsAppLink` both derive their own prefix, and storing one
 * canonical form keeps them from disagreeing about the same client.
 *
 * **Mexico only, by design and not by accident.** `validatePhone` accepts a
 * 10-digit national number or the same with a `+52`/`52` prefix. A 10-digit
 * *foreign* number is indistinguishable from a Mexican one at this layer and
 * will be accepted, then dialed as +52 — that residue is the open decision in
 * #94, not an oversight here. Rejecting the rest at least surfaces the
 * constraint while the tenant is looking at the field.
 */
export function normalizeClientPhone(input: unknown): NormalizedPhone {
  if (input === undefined || input === null) return { value: null };

  const raw = String(input).trim();
  if (!raw) return { value: null };

  const result = validatePhone(raw);
  if (!result.isValid) {
    return {
      value: null,
      error:
        'El teléfono debe ser un número mexicano de 10 dígitos (ej. 8112345678). ' +
        'Es el número al que se envía el código de firma.',
    };
  }

  return { value: result.phone };
}

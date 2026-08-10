import {
  parsePhoneNumberWithError,
  type CountryCode,
  type PhoneNumber,
} from 'libphonenumber-js/max';

export interface PhoneValidationResult {
  isValid: boolean;
  phone: string;
  error?: string;
}

/**
 * The country assumed when a caller types bare national digits.
 *
 * Mexico stays the default because that is who the product is for — a tenant
 * typing "8112345678" means Monterrey, and asking them to pick a country for
 * the 99% case would be a tax on every client they add.
 */
export const DEFAULT_COUNTRY: CountryCode = 'MX';

/**
 * Mexico retired the `1` that used to sit between the country code and a
 * mobile number in August 2019, and `libphonenumber` rejects the old form
 * outright. This repo, however, has always accepted it: `whatsappLink.ts`
 * normalized it from the start and `formatE164Phone` was taught to in
 * #40, so it can arrive from a stored row, a pasted contact card, or a tenant
 * copying from an old CRM.
 *
 * Dropping the `1` before parsing keeps those inputs working. Deliberately
 * narrow: exactly `521` + 10 digits, nothing else, so it cannot swallow a
 * legitimate `+5219…` from some other plan.
 */
function stripLegacyMexicanMobilePrefix(digits: string): string {
  return /^521\d{10}$/.test(digits) ? `52${digits.slice(3)}` : digits;
}

/**
 * Parses user input into a `PhoneNumber`, or null when it is not a real number.
 *
 * Input arrives in three shapes and each has to keep working:
 *   - `+1 212 555 1234`  — explicit country, authoritative, used as given
 *   - `8112345678`       — bare national digits, interpreted as `defaultCountry`
 *   - `5218115559988`    — the legacy Mexican mobile form, de-loused above
 */
function parse(raw: string, defaultCountry: CountryCode): PhoneNumber | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // A leading `+` is the caller telling us the country; never second-guess it.
  const explicitCountryCode = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const candidate = explicitCountryCode
    ? `+${stripLegacyMexicanMobilePrefix(digits)}`
    : stripLegacyMexicanMobilePrefix(digits);

  try {
    // `parsePhoneNumberWithError` throws a typed ParseError on garbage rather
    // than returning undefined, so the two failure modes stay distinguishable.
    const parsed = parsePhoneNumberWithError(candidate, {
      defaultCountry,
      // Bare digits that happen to start with a country code must not be
      // silently reinterpreted as international; `defaultCountry` decides.
      extract: false,
    });
    return parsed.isValid() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validates a phone number, defaulting to Mexico for bare national digits.
 *
 * Returns the **E.164** form (`+528112345678`) as `phone`. Before #94 this
 * returned 10 bare digits and every consumer re-derived `+52` for itself,
 * which is exactly how the same stored number produced a working `wa.me` link
 * and a malformed provider recipient (#40).
 */
export function validatePhone(
  phone: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY
): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, phone: '', error: 'El número telefónico es obligatorio.' };
  }

  const parsed = parse(phone, defaultCountry);
  if (parsed) return { isValid: true, phone: parsed.number };

  return {
    isValid: false,
    phone: '',
    error:
      'Número telefónico inválido. Escribe 10 dígitos para México (ej. 8112345678) ' +
      'o incluye la clave del país (ej. +1 212 555 1234).',
  };
}

export interface NormalizedPhone {
  /** The E.164 value to store, or null when no phone was supplied. */
  value: string | null;
  /** Spanish message for the caller to return with a 400; absent when valid. */
  error?: string;
}

/**
 * Validates and normalizes a phone number on the way into `clients.phone`.
 *
 * Shared by `POST /api/clients`, `PATCH /api/clients/[id]` and
 * `PATCH /api/organization` so they agree — before #40 none validated at all,
 * and the column a signature is delivered to accepted any string that survived
 * `.trim()`.
 *
 * A phone remains **optional**: absent, null and empty all normalize to null.
 * What is rejected is a value that is present and unusable, because storing one
 * converts a correctable typo at the point of entry into a 502 from the OTP
 * route days later, phrased as though the provider were at fault.
 *
 * **International numbers are in scope as of #94.** The stored form is E.164
 * with an explicit country code, which is what removed the inference that used
 * to misroute foreign numbers: `2125551234` was ten digits, so it passed a
 * `^\d{10}$` test and was dialed as `+522125551234` — a real Mexican number
 * belonging to a stranger. `libphonenumber` knows Mexico's numbering plan, so
 * that input is now rejected outright.
 *
 * The residue that remains is genuinely unresolvable without asking: a foreign
 * national number that is *also* a valid Mexican one (`4155551234` is both a
 * San Francisco number and a valid MX number) is still read as Mexican. That is
 * what `defaultCountry` and the form's country selector are for — a tenant who
 * knows their client is abroad picks the country or types `+1`, and the
 * ambiguity never arises.
 */
export function normalizeClientPhone(
  input: unknown,
  defaultCountry: CountryCode = DEFAULT_COUNTRY
): NormalizedPhone {
  if (input === undefined || input === null) return { value: null };

  const raw = String(input).trim();
  if (!raw) return { value: null };

  const result = validatePhone(raw, defaultCountry);
  if (!result.isValid) {
    return {
      value: null,
      error:
        'El teléfono debe ser un número válido: 10 dígitos para México ' +
        '(ej. 8112345678) o con clave del país (ej. +1 212 555 1234). ' +
        'Es el número al que se envía el código de firma.',
    };
  }

  return { value: result.phone };
}

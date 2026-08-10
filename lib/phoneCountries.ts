/**
 * The country list behind the phone field's selector.
 *
 * **Deliberately hand-maintained and short, not derived from
 * `libphonenumber-js`.** That library exports `getCountries()` (245 entries),
 * but reaching for it here would pull ~50 KB of numbering-plan metadata into
 * the client bundle to render a `<select>` — paid by Don Roberto on a phone,
 * on a form where the server is the authority anyway. The metadata earns its
 * place on the write path, where it validates; it does not earn it here, where
 * it would only label options.
 *
 * The consequence to keep in mind: this list decides which countries a tenant
 * can *pick*, not which the product can *store*. A number typed with any other
 * country code (`+81…`) still validates and saves — see `normalizeClientPhone`,
 * which parses against the full metadata. So an unlisted country is a
 * convenience gap, never a rejection. `tests/unit/phoneCountries.test.ts`
 * checks every entry against the real metadata so a wrong calling code here
 * cannot silently ship.
 *
 * Ordering is the product's, not the alphabet's: Mexico first because it is
 * ~all traffic, then the countries a Mexican SMB actually invoices.
 */
export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, matching `libphonenumber-js`'s `CountryCode`. */
  code: string;
  /** Spanish name, since all user-facing copy is (hard rule 8). */
  label: string;
  /** Calling code without the `+`. */
  callingCode: string;
  flag: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'MX', label: 'México', callingCode: '52', flag: '🇲🇽' },
  { code: 'US', label: 'Estados Unidos', callingCode: '1', flag: '🇺🇸' },
  { code: 'CA', label: 'Canadá', callingCode: '1', flag: '🇨🇦' },
  { code: 'ES', label: 'España', callingCode: '34', flag: '🇪🇸' },
  { code: 'CO', label: 'Colombia', callingCode: '57', flag: '🇨🇴' },
  { code: 'AR', label: 'Argentina', callingCode: '54', flag: '🇦🇷' },
  { code: 'CL', label: 'Chile', callingCode: '56', flag: '🇨🇱' },
  { code: 'PE', label: 'Perú', callingCode: '51', flag: '🇵🇪' },
  { code: 'BR', label: 'Brasil', callingCode: '55', flag: '🇧🇷' },
  { code: 'GT', label: 'Guatemala', callingCode: '502', flag: '🇬🇹' },
  { code: 'CR', label: 'Costa Rica', callingCode: '506', flag: '🇨🇷' },
  { code: 'PA', label: 'Panamá', callingCode: '507', flag: '🇵🇦' },
  { code: 'GB', label: 'Reino Unido', callingCode: '44', flag: '🇬🇧' },
  { code: 'DE', label: 'Alemania', callingCode: '49', flag: '🇩🇪' },
  { code: 'FR', label: 'Francia', callingCode: '33', flag: '🇫🇷' },
  { code: 'IT', label: 'Italia', callingCode: '39', flag: '🇮🇹' },
  { code: 'CN', label: 'China', callingCode: '86', flag: '🇨🇳' },
  { code: 'JP', label: 'Japón', callingCode: '81', flag: '🇯🇵' },
];

export const DEFAULT_PHONE_COUNTRY = 'MX';

export interface SplitPhone {
  /** ISO code of the matched country, or the default when nothing matched. */
  country: string;
  /** The national part, digits only. */
  national: string;
}

/**
 * Splits a stored value into the two things the field renders.
 *
 * Handles both the E.164 form written since #94 and the bare-national form
 * that predates it, because a row is only migrated once the backfill runs and
 * the deploy can land first (hard rule 6).
 *
 * Longest calling code wins, so `+502…` (Guatemala) is not read as `+50`. Ties
 * — `+1` is both US and Canada — resolve to whichever is listed first; the
 * emitted value is byte-identical either way, so the choice is cosmetic.
 */
export function splitPhone(value: string | null | undefined): SplitPhone {
  const raw = (value || '').trim();
  if (!raw) return { country: DEFAULT_PHONE_COUNTRY, national: '' };

  const digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    // Pre-#94 shape: bare national digits, always Mexican by definition.
    return { country: DEFAULT_PHONE_COUNTRY, national: digits };
  }

  const match = [...PHONE_COUNTRIES]
    .sort((a, b) => b.callingCode.length - a.callingCode.length)
    .find((c) => digits.startsWith(c.callingCode));

  if (!match) return { country: DEFAULT_PHONE_COUNTRY, national: digits };

  let national = digits.slice(match.callingCode.length);
  // Mexico's retired mobile `1`, so editing an old row does not show it.
  if (match.code === 'MX' && /^1\d{10}$/.test(national)) national = national.slice(1);

  return { country: match.code, national };
}

/**
 * A shape test for client-side affordances — enabling a button, lighting a ✓.
 *
 * **Not a validator, and never the authority.** It knows nothing about
 * numbering plans, so it accepts numbers `normalizeClientPhone` will reject.
 * That asymmetry is the safe direction: the server refuses and the tenant sees
 * a Spanish message naming the problem. The opposite — a client-side check
 * stricter than the server's — would silently block a number the product can
 * actually reach.
 *
 * It exists so a public, mobile-first page can show validity without pulling
 * libphonenumber's ~190 KB of metadata into its bundle.
 */
export function isPlausibleE164(value: string | null | undefined): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test((value || '').trim());
}

/**
 * Rebuilds the E.164 value the API stores. Empty national part → empty string,
 * which the write path reads as "no phone" rather than as an invalid one.
 */
export function joinPhone(country: string, national: string): string {
  const digits = (national || '').replace(/\D/g, '');
  if (!digits) return '';
  const entry = PHONE_COUNTRIES.find((c) => c.code === country);
  const callingCode = entry ? entry.callingCode : PHONE_COUNTRIES[0].callingCode;
  return `+${callingCode}${digits}`;
}

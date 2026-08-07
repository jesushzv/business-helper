/**
 * CLABE (Clave Bancaria Estandarizada) helpers.
 *
 * A CLABE is the 18-digit account key every SPEI transfer is routed by, so it
 * is the single field that decides where a tenant's customers send money. The
 * 18-digit rule was duplicated across the onboarding form, the settings card
 * and the organization API; it lives here now so the three cannot drift.
 *
 * Structure: 3-digit bank code, 3-digit plaza, 11-digit account, 1 check digit.
 */

/** Digits only, capped at 18 — the canonical stored form. */
export function normalizeClabe(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 18);
}

/** Groups of four for display: "0121 8000 1234 5678 90". */
export function formatClabe(raw: string): string {
  return normalizeClabe(raw).replace(/(.{4})/g, '$1 ').trim();
}

/** Exactly 18 digits. This is the contract `PATCH /api/organization` enforces. */
export function isValidClabeLength(raw: string): boolean {
  return /^\d{18}$/.test(normalizeClabe(raw));
}

/**
 * Verifies the 18th digit against the standard weighted checksum: each of the
 * first 17 digits is multiplied by 3, 7, 1 (repeating), each product is taken
 * mod 10, and the check digit is 10 minus the sum mod 10.
 *
 * This catches transpositions and single-digit typos that a length check
 * cannot. It is currently advisory in the UI only — the server still accepts
 * any 18 digits, because tightening that is a deliberate call rather than a
 * silent one. See the tracker for the decision issue.
 */
export function hasValidClabeCheckDigit(raw: string): boolean {
  const digits = normalizeClabe(raw);
  if (digits.length !== 18) return false;

  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += (Number(digits[i]) * weights[i % 3]) % 10;
  }

  return (10 - (sum % 10)) % 10 === Number(digits[17]);
}

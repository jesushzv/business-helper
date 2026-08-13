/**
 * First name for a greeting.
 *
 * The dashboard greets with the first word of the user's name, which turned
 * "Don Roberto" into "¡Hola, Don!" — an honorific with the name it belongs to
 * cut off. A courtesy title alone is not a name: when the first word is one,
 * keep the word after it attached.
 */

/** Courtesy titles common in Mexican Spanish, with or without the period. */
const HONORIFICS = /^(don|doña|sr\.?|sra\.?|srta\.?|lic\.?|ing\.?|arq\.?|dr\.?|dra\.?|profr?\.?|c\.?p\.?)$/i;

export function greetingFirstName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > 1 && HONORIFICS.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

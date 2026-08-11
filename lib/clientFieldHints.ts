/**
 * Shape hints for the client form's amber notes — **never** gates.
 *
 * Deliberately its own module, and deliberately importing nothing. The obvious
 * home was `lib/clientValidation.ts`, and putting them there broke the build:
 * that module imports `lib/apiAuth`, which imports `lib/supabase/server`, so a
 * client component reaching for a five-line regex pulled a server-only module
 * into the browser bundle. `npm run build` is the only gate that sees it —
 * Vitest and `tsc` both pass — which is why CLAUDE.md asks for a build on
 * structural changes.
 *
 * These are hints, not authority. Nothing on the server branches on them: a
 * malformed email or a four-digit `codigo_postal` is stored as typed, because
 * refusing a whole client record over an optional contact or fiscal detail is
 * what made registration unfinishable (#146). They exist so the tenant sees a
 * likely typo beside the field they typed it in, and decides for themselves.
 *
 * Where each value is actually load-bearing, it is refused loudly and at the
 * right moment: `lib/facturapi.ts` will not stamp a CFDI whose receptor block
 * is incomplete.
 */

/**
 * Forgiving on purpose: "something@something.something".
 *
 * A strict RFC 5322 pattern rejects addresses that deliver perfectly well, and
 * a hint that cries wolf gets ignored, which costs more than it saves.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Mexican postal codes are five digits; the CFDI receptor block needs one. */
export function looksLikeCodigoPostal(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

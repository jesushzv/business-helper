import { captureException } from '@/lib/sentry';

/**
 * Turns whatever was thrown into something a Mexican SMB owner can read.
 *
 * Three separate paths were concatenating a provider's English string into a
 * Spanish sentence and showing the result (#103 §3):
 *
 *   'Ocurrió un error al registrar la cuenta: ' + authError.message
 *   → "Ocurrió un error al registrar la cuenta: User already registered"
 *
 * and any component rendering `err.message` would show the browser's own
 * "Failed to fetch" on a dropped connection. Hard rule #8 is Mexican Spanish,
 * plain language — a half-English sentence fails it, and "Failed to fetch"
 * tells the owner nothing about what to do next.
 *
 * The rule here: **a message is shown only if we wrote it.** Anything else
 * maps to a fixed Spanish string and the original goes to `captureException`,
 * so the diagnosis is kept without putting it on screen.
 */

/**
 * Supabase GoTrue's English messages, mapped to what the person should do.
 *
 * Matched on a lowercase substring because GoTrue varies punctuation and
 * casing between versions, and an unmatched message must never fall through
 * to the raw text.
 */
const AUTH_MESSAGES: Array<[string, string]> = [
  ['already registered', 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.'],
  ['user already exists', 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.'],
  ['invalid login credentials', 'Correo o contraseña incorrectos. Revísalos e intenta de nuevo.'],
  ['email not confirmed', 'Todavía no confirmas tu correo. Busca el mensaje que te enviamos.'],
  ['password should be at least', 'Tu contraseña es muy corta. Usa al menos 8 caracteres.'],
  ['weak password', 'Elige una contraseña más difícil de adivinar.'],
  ['unable to validate email', 'Revisa que el correo esté bien escrito.'],
  ['invalid email', 'Revisa que el correo esté bien escrito.'],
  ['rate limit', 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.'],
  ['for security purposes', 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.'],
  ['email rate limit exceeded', 'Enviamos demasiados correos a esta dirección. Espera unos minutos.'],
  ['signups not allowed', 'El registro está deshabilitado en este momento.'],
  ['token has expired', 'Ese enlace ya venció. Solicita uno nuevo.'],
  ['same password', 'La contraseña nueva debe ser distinta de la anterior.'],
];

/** The browser's own network failures, which are never worth showing raw. */
const NETWORK_HINTS = [
  'failed to fetch',
  'networkerror',
  'load failed',
  'network request failed',
  'the internet connection appears to be offline',
];

const NETWORK_MESSAGE =
  'No pudimos conectarnos. Revisa tu conexión a internet e intenta de nuevo.';

/**
 * A Spanish message for an auth failure, and the original recorded.
 *
 * `fallback` is used when the provider says something we have not mapped —
 * deliberately generic, because guessing at an unknown provider error is how
 * a user gets told the wrong thing to do.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  captureException(error, { route: 'auth', extra: { raw } });

  const haystack = raw.toLowerCase();
  if (NETWORK_HINTS.some((hint) => haystack.includes(hint))) return NETWORK_MESSAGE;
  for (const [needle, message] of AUTH_MESSAGES) {
    if (haystack.includes(needle)) return message;
  }
  return fallback;
}

/**
 * A message safe to render from a caught value.
 *
 * Our own thrown errors already carry Spanish written for this audience —
 * `ClientWriteError`, the hooks' mutation failures, the public API envelope —
 * so those pass through. A browser network error does not.
 *
 * This is deliberately not a language detector: it catches the specific
 * English strings that actually reach users, and anything else we wrote stays
 * intact. If an unmapped English string ever shows up, that is a missing
 * mapping at the throw site, not something to paper over here.
 */
export function userFacingMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (!raw.trim()) return fallback;

  const haystack = raw.toLowerCase();
  if (NETWORK_HINTS.some((hint) => haystack.includes(hint))) {
    captureException(error, { route: 'network', extra: { raw } });
    return NETWORK_MESSAGE;
  }
  return raw;
}

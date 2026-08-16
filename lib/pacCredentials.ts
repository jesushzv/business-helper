import crypto from 'crypto';

/**
 * Sealing of PAC API keys.
 *
 * Per docs/02-architecture/cfdi_integration_architecture.md §02, Business
 * Helper never holds a user's CSD (`.cer`, `.key`, password). What it does hold
 * is the API key of the PAC account the user opened themselves — a string that
 * can stamp invoices on their behalf until they revoke it. That is not a
 * certificate, but it is a credential, and a plaintext column full of them is
 * one query away from being every tenant's invoicing ability.
 *
 * Keys are therefore sealed with AES-256-GCM before they reach the database.
 * The keying material lives in PAC_ENCRYPTION_KEY and never in a row, so a
 * database dump on its own decrypts nothing. GCM is authenticated: a tampered
 * ciphertext fails to open rather than yielding a different key.
 */

const SEAL_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export type PacEnvironment = 'sandbox' | 'live';

/**
 * Resolves the 32-byte key from PAC_ENCRYPTION_KEY.
 *
 * Read per call rather than at module load, so a process that sets the variable
 * after import still picks it up and tests can vary it. Accepts base64 or hex;
 * an absent or wrong-length value is fatal — there is no development fallback,
 * because a default key would mean every deployment can open every other
 * deployment's credentials.
 */
function getSealingKey(): Buffer {
  const raw = process.env.PAC_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error('PAC_ENCRYPTION_KEY is required to store or read a PAC API key');
  }

  const decoded = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (decoded.length !== 32) {
    throw new Error('PAC_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)');
  }

  return decoded;
}

/** True when this deployment can seal and open PAC API keys. */
export function isPacEncryptionConfigured(): boolean {
  try {
    getSealingKey();
    return true;
  } catch {
    return false;
  }
}

/** Seals an API key as `v1.<iv>.<tag>.<ciphertext>`, all base64. */
export function sealPacApiKey(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('A PAC API key is required');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getSealingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SEAL_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Opens a sealed key, or returns null.
 *
 * Null covers every failure — malformed envelope, wrong key, tampered
 * ciphertext — because the caller's response is the same in each case and the
 * distinction is not something to leak into an error message.
 */
export function openPacApiKey(sealed: string): string | null {
  if (!sealed || typeof sealed !== 'string') return null;

  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== SEAL_VERSION) return null;

  try {
    const [, ivPart, tagPart, ciphertextPart] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getSealingKey(),
      Buffer.from(ivPart, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    const opened = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64')),
      decipher.final(),
    ]);

    return opened.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * The last four characters of a key, for showing which credential is connected.
 *
 * Four characters of a 30-plus character random key identify it to the person
 * who owns it without helping anyone else guess it.
 */
export function pacApiKeyHint(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  return trimmed.slice(-4) || '????';
}

/**
 * Classifies a Facturapi secret key.
 *
 * `sk_test_` reaches Facturapi's sandbox, which returns documents that are
 * structurally complete and fiscally void. Storing which one a tenant connected
 * is what lets the UI say so instead of presenting a sandbox document as a
 * filed invoice.
 */
export function detectPacEnvironment(apiKey: string): PacEnvironment | null {
  const trimmed = (apiKey || '').trim();
  if (trimmed.startsWith('sk_live_')) return 'live';
  if (trimmed.startsWith('sk_test_')) return 'sandbox';
  return null;
}

export interface PacApiKeyValidation {
  isValid: boolean;
  environment?: PacEnvironment;
  error?: string;
}

/** Checks the shape of a key before it is sealed, so an obvious typo fails at the form. */
export function validatePacApiKey(apiKey: string): PacApiKeyValidation {
  const trimmed = (apiKey || '').trim();

  if (!trimmed) {
    return { isValid: false, error: 'La llave de tu PAC es obligatoria' };
  }

  const environment = detectPacEnvironment(trimmed);
  if (!environment) {
    return {
      isValid: false,
      error: 'La llave de Facturapi debe comenzar con sk_test_ o sk_live_',
    };
  }

  if (trimmed.length < 24) {
    return { isValid: false, error: 'La llave de Facturapi parece incompleta' };
  }

  return { isValid: true, environment };
}

/** Only the variables this module reads; tests pass a literal object. */
type PacEnvRecord = { NODE_ENV?: string };

/**
 * Whether a stamp must be refused because a *sandbox* key is connected on a
 * *production* deployment.
 *
 * A sandbox key returns a complete-looking document — id, UUID-shaped folio,
 * XML and PDF — with no fiscal validity whatsoever. Letting one through in
 * production writes exactly the success state hard rule #1 exists to prevent,
 * except the fabrication arrives wearing a real PAC's response, which is harder
 * to spot than an invented id.
 *
 * `env` is a parameter, not a read of `process.env` in the body: the production
 * branch is otherwise unreachable from a test, and this decision is too
 * consequential to be pinned only by a grep for the error code (which is what
 * `tests/unit/cfdiIssuance.test.ts` could do on its own).
 *
 * Unset `NODE_ENV` reads as *not* production — permissive, and correct: the
 * deployed app always sets it, so the unset case is local tooling, and a
 * refusal there would block sandbox work for no safety gain.
 */
export function refusesSandboxStamp(
  environment: PacEnvironment,
  env: PacEnvRecord = process.env
): boolean {
  return env.NODE_ENV === 'production' && environment === 'sandbox';
}

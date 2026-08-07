import crypto from 'crypto';

/**
 * OTP Digital Signature & Cryptoseal Engine.
 *
 * The signing flow used to be client-authoritative: the browser generated the
 * code, and the API route accepted the expected code (`serverOtp`) from the
 * request body and compared it against the submitted one. Anyone could sign any
 * quote with a single curl by sending the same value twice.
 *
 * The model here is that the server is the only party that ever knows a valid
 * code. It issues the code, stores only a keyed HMAC digest of it, and verifies
 * submissions against that digest. A code is bound to one quote, expires, and
 * burns a server-side attempt on every failure.
 */

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export interface VerifyOTPResult {
  success: boolean;
  attempts: number;
  error?: string;
}

export interface SealPayload {
  contractId: string;
  clientName: string;
  totalAmount: number;
  timestamp: string;
  otpCode: string;
}

export const OTP_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const OTP_TTL_SECONDS = OTP_TTL_MS / 1000;

/**
 * The keying material for OTP digests and digital seals.
 *
 * Resolved per call rather than at module load so a process that sets the
 * variable after import still picks it up, and so tests can vary it. Outside
 * development an absent secret is fatal: falling back to a default would make
 * every seal forgeable by anyone who can read this file.
 */
function getOtpSecret(): string {
  const secret = process.env.OTP_SECRET;

  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'OTP_SECRET must be set to at least 32 characters in production'
      );
    }
    // Development/test only — deterministic so local runs are reproducible.
    return 'dev-only-insecure-otp-secret-do-not-use-in-production';
  }

  return secret;
}

/**
 * Generates a 6-digit code using the CSPRNG.
 *
 * crypto.randomInt replaces Math.random, whose output is predictable from prior
 * values and must never gate a signature.
 */
export function generateOTP(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Derives the stored digest for a code.
 *
 * The quote's public token is mixed in as a salt so a digest lifted from one
 * row cannot be replayed against another, and so identical codes on different
 * quotes do not collide to the same stored value.
 */
export function hashOTP(code: string, scope: string): string {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(`otp:${scope}:${String(code).trim()}`)
    .digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface StoredOtpState {
  hash: string | null;
  expiresAt: string | Date | null;
  attempts: number;
  verified?: boolean;
}

export interface VerifyStoredOTPResult extends VerifyOTPResult {
  /** True when the code expired, so the caller can prompt for a fresh one. */
  expired?: boolean;
}

/**
 * Verifies a submitted code against server-held state.
 *
 * This is the only function the signing route may use. It takes the stored
 * digest — never a plaintext "expected code" — so there is no parameter an
 * attacker could supply to make the comparison trivially succeed.
 */
export function verifyStoredOTP(
  inputCode: string,
  scope: string,
  state: StoredOtpState
): VerifyStoredOTPResult {
  const attempts = state.attempts || 0;

  if (attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      attempts,
      error: `Número máximo de intentos excedido (máximo ${MAX_ATTEMPTS})`,
    };
  }

  if (!state.hash) {
    return {
      success: false,
      attempts,
      error: 'No hay un código de verificación activo. Solicite uno nuevo.',
    };
  }

  if (!state.expiresAt || new Date(state.expiresAt).getTime() < Date.now()) {
    return {
      success: false,
      attempts,
      expired: true,
      error: 'El código de verificación expiró. Solicite uno nuevo.',
    };
  }

  if (!/^\d{6}$/.test(String(inputCode || '').trim())) {
    return {
      success: false,
      attempts: attempts + 1,
      error: 'Código OTP incorrecto',
    };
  }

  if (timingSafeEqual(hashOTP(inputCode, scope), state.hash)) {
    return { success: true, attempts: attempts + 1 };
  }

  return {
    success: false,
    attempts: attempts + 1,
    error: 'Código OTP incorrecto',
  };
}

export function otpExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

/**
 * Produces the tamper-evident seal recorded against a signed quote.
 *
 * Keyed (HMAC) rather than a bare SHA-256 digest: the inputs — contract id,
 * client name, amount, timestamp — are all values a client already knows, so an
 * unkeyed hash could be recomputed by anyone and proved nothing about who
 * signed. Without the secret the seal cannot be forged or recomputed.
 */
export function generateDigitalSeal(payload: SealPayload): string {
  const dataString = `${payload.contractId}:${payload.clientName}:${payload.totalAmount}:${payload.timestamp}:${payload.otpCode}`;
  return crypto.createHmac('sha256', getOtpSecret()).update(dataString).digest('hex');
}

/** Recomputes a seal and compares it, for audit/verification of a stored one. */
export function verifyDigitalSeal(payload: SealPayload, seal: string): boolean {
  return timingSafeEqual(generateDigitalSeal(payload), seal);
}

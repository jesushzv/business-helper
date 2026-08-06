const crypto = require('crypto');

/**
 * OTP Digital Signature & Cryptoseal Engine (CommonJS).
 *
 * CommonJS mirror of lib/otpSeal.ts, loaded by scripts/test-runner.js.
 * Keep the two in sync — see the TypeScript module for the full rationale
 * behind the server-authoritative design.
 */

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function getOtpSecret() {
  const secret = process.env.OTP_SECRET;

  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OTP_SECRET must be set to at least 32 characters in production');
    }
    return 'dev-only-insecure-otp-secret-do-not-use-in-production';
  }

  return secret;
}

// CSPRNG rather than Math.random: a predictable code cannot gate a signature.
function generateOTP() {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, '0');
}

function hashOTP(code, scope) {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update('otp:' + scope + ':' + String(code).trim())
    .digest('hex');
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyStoredOTP(inputCode, scope, state) {
  const attempts = (state && state.attempts) || 0;

  if (attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      attempts: attempts,
      error: 'Número máximo de intentos excedido (máximo ' + MAX_ATTEMPTS + ')',
    };
  }

  if (!state || !state.hash) {
    return {
      success: false,
      attempts: attempts,
      error: 'No hay un código de verificación activo. Solicite uno nuevo.',
    };
  }

  if (!state.expiresAt || new Date(state.expiresAt).getTime() < Date.now()) {
    return {
      success: false,
      attempts: attempts,
      expired: true,
      error: 'El código de verificación expiró. Solicite uno nuevo.',
    };
  }

  if (!/^\d{6}$/.test(String(inputCode || '').trim())) {
    return { success: false, attempts: attempts + 1, error: 'Código OTP incorrecto' };
  }

  if (timingSafeEqual(hashOTP(inputCode, scope), state.hash)) {
    return { success: true, attempts: attempts + 1 };
  }

  return { success: false, attempts: attempts + 1, error: 'Código OTP incorrecto' };
}

function otpExpiryDate(now) {
  const base = now ? new Date(now) : new Date();
  return new Date(base.getTime() + OTP_TTL_MS);
}

/**
 * @deprecated Direct code comparison. Cannot gate a signature — server routes
 * must use verifyStoredOTP. Retained for the legacy suite.
 */
function verifyOTP(inputCode, correctCode, currentAttempts) {
  const attempts = currentAttempts || 0;

  if (attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      attempts: attempts,
      error: 'Número máximo de intentos excedido (máximo ' + MAX_ATTEMPTS + ')',
    };
  }

  const newAttempts = attempts + 1;
  const a = String(inputCode || '').trim();
  const b = String(correctCode || '').trim();

  if (a && timingSafeEqual(a, b)) {
    return { success: true, attempts: newAttempts };
  }

  return { success: false, attempts: newAttempts, error: 'Código OTP incorrecto' };
}

// Keyed (HMAC) so the seal cannot be recomputed from values the client knows.
function generateDigitalSeal(payload) {
  const dataString =
    payload.contractId +
    ':' +
    payload.clientName +
    ':' +
    payload.totalAmount +
    ':' +
    payload.timestamp +
    ':' +
    payload.otpCode;
  return crypto.createHmac('sha256', getOtpSecret()).update(dataString).digest('hex');
}

function verifyDigitalSeal(payload, seal) {
  return timingSafeEqual(generateDigitalSeal(payload), seal);
}

module.exports = {
  generateOTP: generateOTP,
  hashOTP: hashOTP,
  verifyStoredOTP: verifyStoredOTP,
  verifyOTP: verifyOTP,
  otpExpiryDate: otpExpiryDate,
  generateDigitalSeal: generateDigitalSeal,
  verifyDigitalSeal: verifyDigitalSeal,
  OTP_MAX_ATTEMPTS: MAX_ATTEMPTS,
  OTP_TTL_SECONDS: OTP_TTL_MS / 1000,
};

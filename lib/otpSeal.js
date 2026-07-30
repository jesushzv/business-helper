const crypto = require('crypto');

/**
 * OTP Digital Signature & Cryptoseal Engine (CommonJS)
 */

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function verifyOTP(inputCode, correctCode, currentAttempts) {
  const attempts = currentAttempts || 0;

  if (attempts >= 3) {
    return {
      success: false,
      attempts: attempts,
      error: 'Número máximo de intentos excedido (máximo 3)',
    };
  }

  const newAttempts = attempts + 1;

  if (inputCode && String(inputCode).trim() === String(correctCode).trim()) {
    return {
      success: true,
      attempts: newAttempts,
    };
  }

  return {
    success: false,
    attempts: newAttempts,
    error: 'Código OTP incorrecto',
  };
}

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
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

module.exports = {
  generateOTP: generateOTP,
  verifyOTP: verifyOTP,
  generateDigitalSeal: generateDigitalSeal,
};

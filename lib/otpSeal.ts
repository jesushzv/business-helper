import crypto from 'crypto';

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

export function generateOTP(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

export function verifyOTP(inputCode: string, correctCode: string, currentAttempts: number = 0): VerifyOTPResult {
  if (currentAttempts >= 3) {
    return {
      success: false,
      attempts: currentAttempts,
      error: 'Número máximo de intentos excedido (máximo 3)',
    };
  }

  const newAttempts = currentAttempts + 1;

  if (inputCode && inputCode.trim() === correctCode.trim()) {
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

export function generateDigitalSeal(payload: SealPayload): string {
  const dataString = `${payload.contractId}:${payload.clientName}:${payload.totalAmount}:${payload.timestamp}:${payload.otpCode}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

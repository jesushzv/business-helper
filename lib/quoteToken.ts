import crypto from 'crypto';

/**
 * Generates a 32-character hexadecimal cryptographic public token for quotes
 */
export function generatePublicToken(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return crypto.randomBytes(16).toString('hex');
}

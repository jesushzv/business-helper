/**
 * Business Helper — SPEI Receipt & Banxico Clave de Rastreo Validator
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

/**
 * Validates Banxico SPEI Clave de Rastreo (minimum 8 alphanumeric characters).
 */
export function validateTrackingReference(trackingRef: string): ValidationResult {
  if (!trackingRef || typeof trackingRef !== 'string') {
    return {
      isValid: false,
      error: 'La Clave de Rastreo es requerida.',
    };
  }

  const cleaned = trackingRef.trim();

  if (cleaned.length < 8) {
    return {
      isValid: false,
      error: 'La Clave de Rastreo debe contener al menos 8 caracteres.',
    };
  }

  const trackingRegex = /^[a-zA-Z0-9\-_]{8,40}$/;
  if (!trackingRegex.exec(cleaned)) {
    return {
      isValid: false,
      error: 'La Clave de Rastreo sólo debe contener letras y números.',
    };
  }

  return { isValid: true };
}

/**
 * Validates SPEI receipt file size (< 5MB limit) and mime format (PNG, JPG, PDF).
 */
export function validateReceiptFile(file: FileMetadata): ValidationResult {
  if (!file) {
    return {
      isValid: false,
      error: 'El archivo de comprobante es requerido.',
    };
  }

  const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
  if (file.size > MAX_SIZE_BYTES) {
    return {
      isValid: false,
      error: 'El archivo excede el tamaño máximo permitido de 5MB.',
    };
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
  const allowedExts = ['png', 'jpg', 'jpeg', 'pdf'];

  const typeValid = allowedTypes.includes(file.type);
  const extValid = allowedExts.includes(ext || '');

  if (!typeValid && !extValid) {
    return {
      isValid: false,
      error: 'Formato de archivo inválido. Solo se admiten imágenes PNG, JPG o documentos PDF.',
    };
  }

  return { isValid: true };
}

export type ReceiptContentType = 'png' | 'jpg' | 'pdf';

export const RECEIPT_CONTENT_TYPES: Record<ReceiptContentType, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
};

/**
 * Identifies the actual content of a receipt from its leading bytes.
 *
 * `validateReceiptFile` above checks the *claimed* name/size/type — UX, not
 * enforcement, since both are caller-supplied. On the server, where the bytes
 * are in hand, the magic bytes decide: PNG (`\x89PNG\r\n\x1a\n`), JPEG
 * (`\xFF\xD8\xFF`) or PDF (`%PDF`). Returns null for anything else, which an
 * upload route must refuse.
 */
export function sniffReceiptContent(bytes: Uint8Array): ReceiptContentType | null {
  if (bytes.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((b, i) => bytes[i] === b)) return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  ) {
    return 'pdf';
  }
  return null;
}

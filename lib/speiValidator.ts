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

/**
 * Business Helper — SPEI Receipt & Banxico Clave de Rastreo Validator (JS Runtime Export)
 */

function validateTrackingReference(trackingRef) {
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
  if (!trackingRegex.test(cleaned)) {
    return {
      isValid: false,
      error: 'La Clave de Rastreo sólo debe contener letras y números.',
    };
  }

  return { isValid: true };
}

function validateReceiptFile(file) {
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
  const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
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

module.exports = {
  validateTrackingReference,
  validateReceiptFile,
};

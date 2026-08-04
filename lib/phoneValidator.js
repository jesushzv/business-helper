/**
 * Validates Mexican 10-digit mobile/landline phone number.
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, phone: '', error: 'El número telefónico es obligatorio.' };
  }

  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('52') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }

  const regex10Digits = /^\d{10}$/;

  if (regex10Digits.test(cleaned)) {
    return { isValid: true, phone: cleaned };
  }

  return {
    isValid: false,
    phone: cleaned,
    error: 'Número telefónico inválido. Debe contener exactamente 10 dígitos (ej. 8112345678).',
  };
}

module.exports = {
  validatePhone,
};

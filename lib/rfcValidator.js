function validateRFC(rfc) {
  if (!rfc || typeof rfc !== 'string') {
    return { isValid: false, type: null, error: 'El RFC no puede estar vacío.' };
  }

  const cleaned = rfc.trim().toUpperCase();
  const regexMoral = /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/;
  const regexFisica = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

  if (regexMoral.test(cleaned)) {
    return { isValid: true, type: 'moral', rfc: cleaned };
  } else if (regexFisica.test(cleaned)) {
    return { isValid: true, type: 'fisica', rfc: cleaned };
  }

  return {
    isValid: false,
    type: null,
    error: 'Formato de RFC inválido. Debe contener 12 caracteres (Moral) o 13 (Física).',
  };
}

module.exports = { validateRFC };

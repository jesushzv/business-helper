/**
 * Business Helper — WhatsApp 1-Tap Click-to-Chat Link Generator (CommonJS module wrapper)
 */

function generateWhatsAppLink(phone, text) {
  if (!phone) return '';

  let cleaned = String(phone).replace(/\D/g, '');

  if (!cleaned) return '';

  if (cleaned.length === 10) {
    cleaned = `52${cleaned}`;
  } else if (cleaned.length === 13 && cleaned.startsWith('521')) {
    cleaned = `52${cleaned.slice(3)}`;
  }

  const baseUrl = `https://wa.me/${cleaned}`;
  if (text && String(text).trim().length > 0) {
    return `${baseUrl}?text=${encodeURIComponent(String(text).trim())}`;
  }

  return baseUrl;
}

module.exports = { generateWhatsAppLink };

/**
 * Business Helper — WhatsApp 1-Tap Click-to-Chat Link Generator
 * 
 * Sanitizes Mexican phone numbers (+52 / 10-digit) and returns
 * a pre-filled direct WhatsApp wa.me URL for 1-tap messaging.
 */

/**
 * The one greeting every client-facing WhatsApp message opens with.
 *
 * Three components used to hardcode their own copies signed by the demo
 * tenant ("un gusto saludarte de Distribuidora del Norte", "le saluda Don
 * Roberto") — sent to real tenants' clients, in two disagreeing registers
 * (#93). The organization name is a parameter; when it is unknown the
 * greeting simply omits the signature instead of inventing one.
 */
export function buildClientGreeting(clientName: string, orgName?: string | null): string {
  const name = clientName.trim();
  const org = orgName?.trim();
  return org ? `Hola ${name}, le saluda ${org}.` : `Hola ${name}.`;
}

export function generateWhatsAppLink(phone: string | null | undefined, text?: string): string {
  if (!phone) return '';

  // Strip all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  if (!cleaned) return '';

  // Handle Mexican country code variations
  // Case 1: 10-digit Mexican mobile number (e.g. 8115551234 -> 528115551234)
  if (cleaned.length === 10) {
    cleaned = `52${cleaned}`;
  } 
  // Case 2: 13-digit number with old +521 mobile prefix (e.g. 5218115551234 -> 528115551234)
  else if (cleaned.length === 13 && cleaned.startsWith('521')) {
    cleaned = `52${cleaned.slice(3)}`;
  }
  // Case 3: 12-digit number already prefixed with 52
  else if (cleaned.length === 12 && cleaned.startsWith('52')) {
    // Already in 52XXXXXXXXXX format
  }

  const baseUrl = `https://wa.me/${cleaned}`;
  if (text && text.trim().length > 0) {
    return `${baseUrl}?text=${encodeURIComponent(text.trim())}`;
  }

  return baseUrl;
}

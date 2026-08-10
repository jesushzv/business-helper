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

/**
 * Builds a `wa.me` link from a stored phone.
 *
 * Since #94 the stored form is E.164, so the country code is already in the
 * value and this must **not** re-derive one — re-prefixing a `+1` client with
 * 52 is precisely the misrouting that issue was filed about. `wa.me` wants the
 * digits without the leading `+`, so for a migrated row the whole job is
 * dropping that character.
 *
 * This deliberately does **not** import `libphonenumber-js`: it runs in client
 * components, and the ~50 KB of metadata buys nothing once the stored value is
 * already canonical. Validation happens on the write path, where the cost is
 * paid once on the server.
 *
 * The pre-#94 shapes are still handled because a deploy can land before the
 * backfill does (hard rule 6).
 */
export function generateWhatsAppLink(phone: string | null | undefined, text?: string): string {
  if (!phone) return '';

  const isE164 = phone.trim().startsWith('+');
  let cleaned = phone.replace(/\D/g, '');

  if (!cleaned) return '';

  if (!isE164) {
    // Legacy stored shapes, from a row the backfill has not reached yet.
    // Case 1: 10-digit Mexican number (e.g. 8115551234 -> 528115551234)
    if (cleaned.length === 10) {
      cleaned = `52${cleaned}`;
    }
    // Case 2: 13-digit number with old +521 mobile prefix (5218115551234 -> 528115551234)
    else if (cleaned.length === 13 && cleaned.startsWith('521')) {
      cleaned = `52${cleaned.slice(3)}`;
    }
    // Case 3: 12-digit number already prefixed with 52 — nothing to do.
  } else if (/^521\d{10}$/.test(cleaned)) {
    // An explicitly-international value can still carry the retired Mexican
    // mobile `1`; wa.me does not recognise it.
    cleaned = `52${cleaned.slice(3)}`;
  }

  const baseUrl = `https://wa.me/${cleaned}`;
  if (text && text.trim().length > 0) {
    return `${baseUrl}?text=${encodeURIComponent(text.trim())}`;
  }

  return baseUrl;
}

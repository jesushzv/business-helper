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
 * The message body that goes out with a quote, built in one place.
 *
 * It was inline in `QuoteCard`, which is why "Generar y Compartir" could not
 * share: the wizard had no way to produce the text its own card would send, so
 * the handler closed the modal and left the owner to find the new card and tap
 * WhatsApp separately — two extra taps against a ≤3 budget, under a label
 * promising otherwise (#104).
 *
 * `publicUrl` must come from `getQuotePublicUrl(quote.public_token)` on the row
 * the **server** returned. A share action for a row with no token offers no
 * link at all rather than a guess.
 */
export function buildQuoteShareMessage(params: {
  clientName: string;
  title: string;
  /** Already formatted for display, e.g. "$15,000.00". */
  formattedTotal: string;
  publicUrl: string;
}): string {
  const { clientName, title, formattedTotal, publicUrl } = params;
  return (
    `Hola ${clientName}, le comparto la cotización "${title}" por un total de ${formattedTotal}.` +
    `\n\nPuede ver el detalle y firmar en línea aquí:\n${publicUrl}`
  );
}

/**
 * A `wa.me` link with **no recipient** — WhatsApp opens its contact picker.
 *
 * For the case where the app knows the message but not the number: a team
 * invitation identifies its recipient by email, and no phone is ever recorded
 * for them. `generateWhatsAppLink` returns `''` for a missing phone on purpose
 * (never send a client's quote to a number the tenant did not record), so that
 * function cannot serve this, and the invite flow was left with a copy button
 * under copy reading *"comparte este enlace por WhatsApp o correo"* (#104).
 *
 * Only for recipients the *user* picks at send time. Never as a fallback when a
 * stored phone is missing — that would silently turn "send to this client" into
 * "send to whoever you tap next".
 */
export function buildWhatsAppShareLink(text: string): string {
  const body = text.trim();
  if (!body) return '';
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
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

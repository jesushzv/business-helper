import type { Quote, Client } from '@/types';
import { getQuotePublicUrl } from '@/lib/url';
import { generateWhatsAppLink, buildQuoteShareMessage } from '@/lib/whatsappLink';

/**
 * The `wa.me` URL for sending a stored quote to its client, or `null`.
 *
 * A named exported function with its own test rather than a few lines inside
 * the quotes page, because it is exactly the shape that has gone wrong here
 * before: a link assembled from whatever fields happened to be in scope. Two
 * facts have to hold before there is a link at all, and both return `null`
 * rather than something plausible.
 *
 * - **The quote must carry a `public_token`.** It only exists on the row the
 *   server stored, never on the wizard's draft, and `/q/[token]` is what the
 *   link resolves. A share action whose row has no token offers no link
 *   (the #72/#79 rule).
 * - **The client must have a phone on record.** No fallback number and no
 *   numberless `wa.me` picker here: this message carries a specific client's
 *   pricing, and "send to whoever you tap next" is not the same action. The
 *   default before #93 was a real, dialable Monterrey number.
 *
 * `null` is the caller's cue to say *why* there is no link — not to hide the
 * action, and certainly not to report the quote as sent.
 */
export function buildQuoteWhatsAppUrl(quote: Quote, clients: Client[]): string | null {
  if (!quote.public_token) return null;

  const client = clients.find((c) => c.id === quote.client_id);
  const phone = client?.phone;
  if (!phone) return null;

  const formattedTotal = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: quote.currency || 'MXN',
  }).format(quote.total_amount);

  const message = buildQuoteShareMessage({
    clientName: client?.name || 'Cliente sin asignar',
    title: quote.title,
    formattedTotal,
    publicUrl: getQuotePublicUrl(quote.public_token),
  });

  // generateWhatsAppLink returns '' for a phone it cannot make sense of, which
  // must not travel onward as a link-shaped empty string.
  return generateWhatsAppLink(phone, message) || null;
}

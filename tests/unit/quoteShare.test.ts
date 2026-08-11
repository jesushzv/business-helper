import { describe, it, expect } from 'vitest';
import { buildQuoteWhatsAppUrl } from '@/lib/quoteShare';
import { buildQuoteShareMessage, buildWhatsAppShareLink } from '@/lib/whatsappLink';
import type { Quote, Client } from '@/types';

/**
 * #104 — "Generar y Compartir" did not share.
 *
 * The label promised a send; the handler closed the wizard and left the owner
 * to find the new card and tap WhatsApp there, which is two extra taps against
 * a ≤3 budget. The message text lived inline in `QuoteCard`, so the wizard had
 * no way to build the one its own card would send.
 *
 * The risk in closing it is the repo's dominant defect class: a link assembled
 * from whatever is in scope. `/pay/` has shipped built from a milestone id
 * (#72) and from a literal origin four times (#36, #47, #73). So the builder is
 * an exported function with its own test, and it returns `null` — never a
 * plausible-looking URL — whenever a fact it needs is missing.
 */

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    organization_id: 'org-1',
    client_id: 'client-1',
    title: 'Instalación eléctrica',
    total_amount: 15000,
    currency: 'MXN',
    status: 'draft',
    public_token: 'tok_abc123',
    ...overrides,
  } as Quote;
}

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    organization_id: 'org-1',
    name: 'Constructora del Valle',
    phone: '+528112345678',
    ...overrides,
  } as Client;
}

describe('buildQuoteWhatsAppUrl (#104)', () => {
  it('builds a wa.me link to the client from the stored token', () => {
    const url = buildQuoteWhatsAppUrl(quote(), [client()]);

    expect(url).toBeTruthy();
    expect(url).toContain('https://wa.me/528112345678');
    const text = decodeURIComponent(new URL(url!).searchParams.get('text') || '');
    expect(text).toContain('Constructora del Valle');
    expect(text).toContain('Instalación eléctrica');
    // The public signing link, from the stored token — not a contract or
    // milestone id, and not a literal origin.
    expect(text).toContain('/q/tok_abc123');
  });

  it('formats the total as MXN currency, not a bare number', () => {
    const url = buildQuoteWhatsAppUrl(quote(), [client()]);
    const text = decodeURIComponent(new URL(url!).searchParams.get('text') || '');
    expect(text).toContain('15,000');
    expect(text).not.toContain('15000.');
  });

  it('returns null when the quote carries no public_token', () => {
    // The draft the wizard holds has none; only the stored row does. A link
    // built before the server answered would 404 in front of a paying client.
    expect(buildQuoteWhatsAppUrl(quote({ public_token: '' }), [client()])).toBeNull();
  });

  it('returns null when the client has no phone on record', () => {
    // Never a fallback number and never the numberless picker: this message
    // carries one client's pricing. The default before #93 was a real,
    // dialable Monterrey number.
    expect(buildQuoteWhatsAppUrl(quote(), [client({ phone: null })])).toBeNull();
    expect(buildQuoteWhatsAppUrl(quote(), [])).toBeNull();
  });

  it('returns null rather than a link-shaped empty string for an unusable phone', () => {
    expect(buildQuoteWhatsAppUrl(quote(), [client({ phone: 'llamar a la oficina' })])).toBeNull();
  });

  it('picks the quote’s own client, not the first in the list', () => {
    const url = buildQuoteWhatsAppUrl(quote({ client_id: 'client-2' }), [
      client(),
      client({ id: 'client-2', name: 'Ferretería La Central', phone: '+528187654321' }),
    ]);

    expect(url).toContain('528187654321');
    expect(decodeURIComponent(url!)).toContain('Ferretería La Central');
  });
});

describe('buildQuoteShareMessage — one message for the wizard and the card', () => {
  it('names the client, the quote and the total, and ends on the signing link', () => {
    const message = buildQuoteShareMessage({
      clientName: 'Constructora del Valle',
      title: 'Instalación eléctrica',
      formattedTotal: '$15,000.00',
      publicUrl: 'https://businesshelper.app/q/tok_abc123',
    });

    expect(message).toContain('Constructora del Valle');
    expect(message).toContain('Instalación eléctrica');
    expect(message).toContain('$15,000.00');
    expect(message.trimEnd().endsWith('https://businesshelper.app/q/tok_abc123')).toBe(true);
  });
});

describe('buildWhatsAppShareLink — the recipient-less invite share (#104)', () => {
  it('opens WhatsApp with the text and no number, so the user picks the contact', () => {
    const url = buildWhatsAppShareLink('Te invito a colaborar: https://businesshelper.app/invitacion/x');

    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('https://businesshelper.app/invitacion/x');
  });

  it('returns nothing for empty text instead of a bare wa.me link', () => {
    expect(buildWhatsAppShareLink('')).toBe('');
    expect(buildWhatsAppShareLink('   ')).toBe('');
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { QuoteCard } from '@/components/quotes/QuoteCard';
import type { Quote, Client } from '@/types';

const quote = {
  id: 'q-12345678-abcd',
  title: 'Instalación de red',
  status: 'sent',
  total_amount: 25000,
  currency: 'MXN',
  public_token: 'tok_abc123',
  valid_until: '2026-09-01',
} as unknown as Quote;

const clientWithPhone = {
  id: 'c-1',
  name: 'Ferretería El Norte',
  phone: '8112223344',
} as unknown as Client;

const clientWithoutPhone = {
  id: 'c-2',
  name: 'Cliente Sin Teléfono',
  phone: null,
} as unknown as Client;

describe('QuoteCard WhatsApp link integrity (#36)', () => {
  it('builds the wa.me link from the client phone and the current origin', () => {
    render(<QuoteCard quote={quote} client={clientWithPhone} />);

    const link = screen.getByRole('link', { name: /Enviar por WhatsApp/i });
    const href = link.getAttribute('href') || '';
    expect(href).toContain('https://wa.me/528112223344');
    // jsdom's origin is http://localhost:3000 — the embedded quote URL must
    // point at the rendering origin, never at a hardcoded host.
    expect(decodeURIComponent(href)).toContain('http://localhost:3000/q/tok_abc123');
    expect(decodeURIComponent(href)).not.toContain('businesshelper.mx');
  });

  it('disables the WhatsApp action instead of falling back to a stranger’s number when the client has no phone', () => {
    render(<QuoteCard quote={quote} client={clientWithoutPhone} />);

    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/i })).toBeNull();
    const disabled = screen.getByRole('button', { name: /Agrega un teléfono/i });
    expect(disabled).toBeDisabled();
    // The retired fallback was a real, dialable Monterrey number.
    expect(document.body.innerHTML).not.toContain('8115551234');
  });

  it('treats a missing client the same as a client without a phone', () => {
    render(<QuoteCard quote={quote} />);
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Agrega un teléfono/i })).toBeDisabled();
  });

  it('offers deletion through the parent\'s confirm flow for a still-open quote', () => {
    const onDelete = vi.fn();
    render(<QuoteCard quote={quote} client={clientWithPhone} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /Eliminar Cotización/i }));
    expect(onDelete).toHaveBeenCalledWith('q-12345678-abcd');
  });

  it.each(['accepted', 'converted'] as const)(
    'never renders a delete control on an %s quote — it carries a signature or a live /pay/ link',
    (status) => {
      const onDelete = vi.fn();
      render(
        <QuoteCard quote={{ ...quote, status } as unknown as Quote} client={clientWithPhone} onDelete={onDelete} />
      );
      expect(screen.queryByRole('button', { name: /Eliminar Cotización/i })).toBeNull();
    }
  );

  it('renders no delete control at all when the surface offers none (a role without delete_records)', () => {
    render(<QuoteCard quote={quote} client={clientWithPhone} />);
    expect(screen.queryByRole('button', { name: /Eliminar Cotización/i })).toBeNull();
  });

  it('source carries no hardcoded origin or phone, so a future fallback fails here rather than in a customer chat', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../components/quotes/QuoteCard.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/https?:\/\/businesshelper\./);
    expect(source).not.toContain('8115551234');
    expect(source).toContain('getQuotePublicUrl');
    // One mention was not enough (#292): "Ver Portal" hand-built /q/${token}
    // on line 107 while line 48 used the builder, and the old assertion was
    // satisfied by either. No hand-built /q/ link may exist in this file.
    expect(source).not.toMatch(/\/q\/\$\{/);
  });
});

/**
 * The blocked-client warning (#340).
 *
 * #237 decided option C — warn, don't refuse — and #203 already covers the
 * *creation* path: `QuoteWizardModal` shows the red notice and disables submit
 * for a blocked client, because `POST /api/quotes` refuses it.
 *
 * The gap #340 names is an existing quote that already points at a blocked
 * client. There is no quote editor in the product — the wizard only creates,
 * and the sole client-side `PUT` sends `{status}` — so the moments that matter
 * are the ones the card offers: sharing the quote and converting it. The
 * server deliberately allows both, so this warns and never blocks.
 */
describe('the blocked-client notice (#340)', () => {
  const blockedClient = {
    id: 'c-1',
    name: 'Comercial Morosa SA',
    phone: '8112223344',
    credit_status: 'blocked',
  } as unknown as Client;

  const notice = () => screen.queryByText(/solo contado/i);

  it('names the client and says the owner made the call', () => {
    render(<QuoteCard quote={quote} client={blockedClient} creditBlocked />);

    expect(notice()).toBeTruthy();
    expect(notice()?.textContent).toContain('Comercial Morosa SA');
    // Plain Spanish about a business decision, not a machine state.
    expect(notice()?.textContent).not.toMatch(/CLIENT_CREDIT_BLOCKED|credit_status|blocked/i);
  });

  it('informs without blocking — every action still works', () => {
    // The server allows a quote already pointing at a blocked client to move
    // forward, so a control disabled here would be the UI inventing a refusal.
    render(<QuoteCard quote={quote} client={blockedClient} creditBlocked />);

    const share = screen.getByRole('link', { name: /Enviar por WhatsApp/i });
    expect(share).toHaveAttribute('href', expect.stringContaining('wa.me'));
    expect(share.getAttribute('aria-disabled')).toBeNull();
  });

  it('appears above the actions, not below them', () => {
    // On a 375px card a notice under the buttons is one the owner taps past.
    render(<QuoteCard quote={quote} client={blockedClient} creditBlocked />);

    const share = screen.getByRole('link', { name: /Enviar por WhatsApp/i });
    const position = notice()?.compareDocumentPosition(share);
    // DOCUMENT_POSITION_FOLLOWING === 4: the share button comes after the notice.
    expect((position as number) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says nothing for a client whose credit is fine', () => {
    render(<QuoteCard quote={quote} client={clientWithPhone} creditBlocked={false} />);

    expect(notice()).toBeNull();
  });

  it('says nothing while the answer is unknown', () => {
    // `/api/clients` failed, or this quote's client is not in the list. Neither
    // a false all-clear nor a false accusation — the #64 rule.
    render(<QuoteCard quote={quote} client={clientWithPhone} creditBlocked={null} />);

    expect(notice()).toBeNull();
  });

  it('defaults to unknown when the prop is not passed at all', () => {
    render(<QuoteCard quote={quote} client={clientWithPhone} />);

    expect(notice()).toBeNull();
  });
});

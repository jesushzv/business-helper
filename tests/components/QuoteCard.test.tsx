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

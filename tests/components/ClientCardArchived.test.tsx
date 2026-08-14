import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClientCard } from '@/components/clients/ClientCard';
import type { Client } from '@/types';

/**
 * The archived view's card (#337).
 *
 * Archiving exists because #262's delete refusal was a dead end: a client with
 * any quote or contract can never be deleted (ON DELETE RESTRICT), so the
 * directory had no escape hatch. The archived view is where they go, and the
 * one thing it must do is let them back.
 */

const CLIENT = {
  id: 'c-1',
  name: 'Constructora del Bajío',
  contact_name: 'Ing. Ana Ruiz',
  phone: '8112223344',
  health_score: 80,
  archived_at: '2026-08-14T08:00:00Z',
} as unknown as Client;

describe('ClientCard in the archived view (#337)', () => {
  it('offers Restaurar instead of a link to a page that would 404', () => {
    // The detail page resolves its client from the active directory, so an
    // archived client has no profile to reach. A link into "Cliente no
    // encontrado" would be the dead end this feature removes.
    render(<ClientCard client={CLIENT} onRestore={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Restaurar/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Ver Perfil/i })).toBeNull();
    // The name is text, not a link that goes nowhere. Asserted by destination
    // rather than by accessible name — the WhatsApp anchor carries the client
    // name inside its prefilled message.
    const profileLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/clients/'));
    expect(profileLinks).toHaveLength(0);
    expect(screen.getByText('Constructora del Bajío')).toBeTruthy();
  });

  it('hands the whole client back, so the caller can name it in the confirmation', () => {
    const onRestore = vi.fn();
    render(<ClientCard client={CLIENT} onRestore={onRestore} />);

    fireEvent.click(screen.getByRole('button', { name: /Restaurar/i }));

    expect(onRestore).toHaveBeenCalledWith(CLIENT);
  });

  it('keeps a ≥48px target — the archived view is reachable on a phone', () => {
    render(<ClientCard client={CLIENT} onRestore={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Restaurar/i }).className).toContain('min-h-[48px]');
  });

  it('is the ordinary card again without the handler', () => {
    render(<ClientCard client={CLIENT} />);

    expect(screen.queryByRole('button', { name: /Restaurar/i })).toBeNull();
    expect(screen.getByRole('link', { name: /Ver Perfil/i })).toHaveAttribute(
      'href',
      '/clients/c-1'
    );
  });
});

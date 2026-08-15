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
 *
 * Since #360 it must also let them be *read*: an archived client's profile
 * resolves and says it is archived, so the card links to it like any other.
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
  it('offers Restaurar, and keeps the profile reachable (#360)', () => {
    // This assertion used to be its opposite, and the reason was sound at the
    // time: the detail page resolved its client from the active directory, so
    // an archived client had no profile to reach and the link led to "Cliente
    // no encontrado". #360 removed that premise — the page reads
    // `GET /api/clients/[id]`, which answers for archived rows, and states the
    // archived status itself. Their history is browsable again, so hiding the
    // link would now be the dead end.
    render(<ClientCard client={CLIENT} onRestore={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Restaurar/i })).toBeTruthy();
    // Asserted by destination rather than by accessible name — the WhatsApp
    // anchor carries the client name inside its prefilled message.
    const profileLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/clients/c-1');
    expect(profileLinks.length).toBeGreaterThan(0);
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

/**
 * Who may restore (#337).
 *
 * `POST /api/clients/[id]/archive` requires `delete_records`, which only owner
 * and manager hold. The detail page gated both its buttons on that from the
 * start; the archived card did not, so a member could tap Restaurar and meet a
 * 403 — CLAUDE.md's corollary: never send a user to fix something they lack
 * the write for.
 */
describe('the restore control follows the capability (#337)', () => {
  it('is absent when the caller cannot archive', () => {
    // What the page passes for a known role without delete_records.
    render(<ClientCard client={CLIENT} onRestore={undefined} />);

    expect(screen.queryByRole('button', { name: /Restaurar/i })).toBeNull();
  });

  it('is present when they can', () => {
    render(<ClientCard client={CLIENT} onRestore={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Restaurar/i })).toBeTruthy();
  });
});

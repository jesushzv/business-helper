import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamMembersCard } from '@/components/team/TeamMembersCard';

/**
 * #104 — the invite flow's own copy reads *"comparte este enlace por WhatsApp o
 * correo"* and it offered only a copy button. The clearest miss of the
 * pre-filled-link rule in the app: every client-facing action is supposed to
 * hand the owner a `wa.me/` link rather than a string to paste.
 *
 * The link carries **no recipient**, deliberately. An invitation identifies its
 * person by email and no phone is ever recorded for them, so WhatsApp opens its
 * contact picker. That is only acceptable because the user chooses at send
 * time — it must never stand in for a client's missing stored phone.
 */

const inviteMember = vi.fn();

vi.mock('@/lib/hooks/useTeamMembers', () => ({
  useTeamMembers: () => ({
    members: [],
    invitations: [],
    loading: false,
    inviting: false,
    error: null,
    inviteMember,
    updateRole: vi.fn(),
  }),
}));

const INVITE_URL = 'https://businesshelper.app/invitacion/tok_invite_123';

beforeEach(() => {
  vi.clearAllMocks();
  inviteMember.mockResolvedValue({ success: true, inviteUrl: INVITE_URL });
});

/** Opens the modal and completes an invite, which is what reveals the link. */
async function createInvite() {
  render(<TeamMembersCard />);
  fireEvent.click(screen.getByRole('button', { name: /Invitar Colaborador/i }));

  fireEvent.change(screen.getByPlaceholderText(/colaborador@empresa/i), {
    target: { value: 'contador@despacho.mx' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Crear Invitación/i }));

  await waitFor(() => expect(screen.getByDisplayValue(INVITE_URL)).toBeTruthy());
}

describe('the invitation link can be sent by WhatsApp (#104)', () => {
  it('offers a pre-filled wa.me link carrying the invitation URL', async () => {
    await createInvite();

    const share = screen.getByRole('link', { name: /Enviar por WhatsApp/i }) as HTMLAnchorElement;
    expect(share.href.startsWith('https://wa.me/?text=')).toBe(true);
    // The link the *server* returned, not a constructed guess.
    expect(decodeURIComponent(share.href)).toContain(INVITE_URL);
  });

  it('opens WhatsApp in a new tab without leaking the opener', async () => {
    await createInvite();

    const share = screen.getByRole('link', { name: /Enviar por WhatsApp/i }) as HTMLAnchorElement;
    expect(share.target).toBe('_blank');
    expect(share.rel).toContain('noopener');
  });

  it('shows no share action before an invitation exists', () => {
    render(<TeamMembersCard />);
    fireEvent.click(screen.getByRole('button', { name: /Invitar Colaborador/i }));

    // Nothing to share yet — an action here would be offering to send a link
    // the server has not created.
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/i })).toBeNull();
  });

  it('keeps the copy button — WhatsApp is an addition, not a replacement', async () => {
    await createInvite();
    expect(screen.getByRole('button', { name: /Copiar/i })).toBeTruthy();
  });
});

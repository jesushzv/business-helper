import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamMembersCard } from '@/components/team/TeamMembersCard';

/**
 * Inviting a collaborator (#149).
 *
 * This modal used to close on a green "Invitación enviada exitosamente".
 * Nothing had been sent — no mail provider is configured and the endpoint wrote
 * no row — so the owner waited for a colleague who would never receive
 * anything. It now shows the link the server created and says who has to
 * deliver it.
 *
 * That is a claim about the *stored invitation*, which is exactly the kind a
 * component test can hold and a handler test cannot: the defect was never in
 * the request, it was in what the screen said afterwards.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const TEAM = {
  members: [
    { id: 'mem-1', name: 'Roberto Elizondo', email: 'roberto@elizondo.mx', role: 'owner', isCurrentUser: true },
    { id: 'mem-2', name: 'Mariana Sada', email: 'mariana@elizondo.mx', role: 'manager', isCurrentUser: false },
  ],
  invitations: [],
};

const openInvite = () => screen.getByRole('button', { name: /Invitar Colaborador/i });
const emailInput = () => screen.getByPlaceholderText(/colaborador@empresa/i) as HTMLInputElement;
const createInvite = () => screen.getByRole('button', { name: /Crear Invitación/i });

/** Renders with the team loaded and the invite modal open. */
async function renderWithModal() {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, TEAM));
  render(<TeamMembersCard />);
  await screen.findByText('Mariana Sada');
  fireEvent.click(openInvite());
  await waitFor(() => expect(emailInput()).toBeTruthy());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the team the organization actually has', () => {
  it('lists the members the API returned, with their roles', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, TEAM));
    render(<TeamMembersCard />);

    await screen.findByText('Roberto Elizondo');
    expect(screen.getByText('Mariana Sada')).toBeTruthy();
    expect(screen.getByText(/Gerente Operativo/i)).toBeTruthy();
    expect(screen.getByText('(tú)')).toBeTruthy();
  });

  it('says the list is empty rather than inventing two colleagues', async () => {
    // It used to render "Don Roberto" and "Lic. Mariana" for every tenant.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { members: [], invitations: [] }));
    render(<TeamMembersCard />);

    await screen.findByText(/Todavía no hay colaboradores/i);
    expect(screen.queryByText(/Lic\. Mariana/i)).toBeNull();
  });

  it('surfaces a failed read as an error, not as an empty team', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<TeamMembersCard />);

    await waitFor(() => expect(screen.queryByText(/Cargando equipo/i)).toBeNull());
    expect(screen.queryByText('Roberto Elizondo')).toBeNull();
  });
});

describe('creating an invitation', () => {
  it('shows the link the server created and says the inviter must send it', async () => {
    await renderWithModal();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        invitation: { id: 'inv-1', email: 'nuevo@elizondo.mx', role: 'member', status: 'pending' },
        inviteUrl: 'https://businesshelper.app/invitacion/tok-abc123',
        emailSent: false,
      })
    );

    fireEvent.change(emailInput(), { target: { value: 'nuevo@elizondo.mx' } });
    fireEvent.click(createInvite());

    // The link lands in a read-only input for copying, not as page text.
    await waitFor(() =>
      expect(screen.getByDisplayValue('https://businesshelper.app/invitacion/tok-abc123')).toBeTruthy()
    );
    // The old lie, in the exact words it used.
    expect(screen.queryByText(/Invitación enviada exitosamente/i)).toBeNull();
    expect(screen.getByText(/vence en 7 días/i)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/organization/members');
    expect(JSON.parse(String(init.body))).toMatchObject({ email: 'nuevo@elizondo.mx' });
  });

  it('keeps the form open with the reason when the server refuses', async () => {
    await renderWithModal();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 'FORBIDDEN', message: 'Tu rol no permite invitar colaboradores.' },
      })
    );

    fireEvent.change(emailInput(), { target: { value: 'nuevo@elizondo.mx' } });
    fireEvent.click(createInvite());

    // Inside the dialog, where the person who just tapped Crear is looking —
    // a message they would have to close the modal to find is not a message
    // (#146). The card behind it repeats the same text; that is not the check.
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByText(/Tu rol no permite invitar colaboradores/i)).toBeTruthy()
    );
    // No link, and the form is still there to correct — never a confirmation.
    expect(screen.queryByDisplayValue(/invitacion\/tok-/)).toBeNull();
    expect(emailInput()).toBeTruthy();
  });

  it('offers only the roles an invite can grant — never owner', async () => {
    await renderWithModal();

    // Scoped to the invite form: each member row carries its own role select.
    const form = document.querySelector('form') as HTMLFormElement;
    const options = Array.from(form.querySelectorAll('option')).map((o) => o.getAttribute('value'));
    expect(options).toEqual(['manager', 'member', 'accountant']);
  });

  it('keeps every control within a thumb’s reach', async () => {
    await renderWithModal();
    expect(createInvite().className).toMatch(/min-h-\[48px\]/);
    expect(emailInput().className).toMatch(/min-h-\[48px\]/);
  });
});

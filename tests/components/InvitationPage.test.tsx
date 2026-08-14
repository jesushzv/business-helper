import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InvitationPage from '@/app/invitacion/[token]/page';

/**
 * #269 on the screen that has to deliver the news.
 *
 * The route now says whether joining changes what this account opens; this is
 * the half the invitee actually sees. The failing shape is specific: a success
 * banner and a `router.push('/dashboard')` 1.5 seconds later, landing them on a
 * different company's data with nothing having said so.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tok-1' }),
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { email: 'contador@despacho.mx' } } }),
    },
  }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function acceptInvitation() {
  render(<InvitationPage />);
  const button = await screen.findByRole('button', { name: /Aceptar invitación/i });
  fireEvent.click(button);
}

describe('an acceptance that changes nothing on screen', () => {
  const NOTICE =
    'Ya quedaste registrado en el equipo de «Materiales del Norte». Por ahora tu cuenta sigue ' +
    'abriendo «Constructora del Bajío»: Business Helper muestra una empresa a la vez.';

  it('shows the explanation instead of announcing a panel that will show another company', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        organizationId: 'org-cliente-2',
        notice: { code: 'ACTIVE_ORGANIZATION_UNCHANGED', message: NOTICE },
        activeOrganizationId: 'org-cliente-1',
      })
    );

    await acceptInvitation();

    await screen.findByText(/Materiales del Norte/);
    expect(screen.getByText(/una empresa a la vez/i)).toBeTruthy();
    // The old copy promised the opposite of what would happen.
    expect(screen.queryByText(/Abriendo tu panel/i)).toBeNull();
  });

  it('does not redirect them there on a timer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        organizationId: 'org-cliente-2',
        notice: { code: 'ACTIVE_ORGANIZATION_UNCHANGED', message: NOTICE },
      })
    );

    await acceptInvitation();
    await screen.findByText(/Materiales del Norte/);

    await vi.advanceTimersByTimeAsync(5000);
    expect(push).not.toHaveBeenCalled();
    // They can still go, deliberately, having read why.
    expect(screen.getByRole('link', { name: /Ir a mi panel/i })).toBeTruthy();
  });
});

describe('the ordinary acceptance is untouched', () => {
  it('confirms and opens the dashboard when the invitation is the org they will see', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, organizationId: 'org-1', notice: null })
    );

    await acceptInvitation();

    await screen.findByText(/Ya formas parte del equipo/i);
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('reports a refusal as a refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'EXPIRED', message: 'Esta invitación expiró. Pide una nueva a tu equipo' },
      })
    );

    await acceptInvitation();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/expiró/i);
    expect(push).not.toHaveBeenCalled();
  });
});

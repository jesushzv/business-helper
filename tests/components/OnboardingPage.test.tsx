import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OnboardingPage from '@/app/onboarding/page';

/**
 * #49 — onboarding must not report success for an organization that was never
 * created. The old handler ignored the response and pushed to /dashboard in a
 * finally block, so a 401/500/validation failure delivered the user to a
 * dashboard where every route answers 403 NO_ORGANIZATION, with no way back.
 */

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function completeBothSteps() {
  render(<OnboardingPage />);

  fireEvent.change(screen.getByPlaceholderText(/Distribuidora del Norte/i), {
    target: { value: 'Ferretería La Silla' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Continuar a Datos Fiscales/i }));

  fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));
}

describe('OnboardingPage completion (#49)', () => {
  it('navigates to the dashboard when the organization was actually created', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { organization: { id: 'org-1', name: 'Ferretería La Silla' } })
    );

    await completeBothSteps();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays on the form and shows the API error when creation fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo crear la organización' } })
    );

    await completeBothSteps();

    await waitFor(() =>
      expect(screen.getByText('No se pudo crear la organización')).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
    // The form is still there for a retry.
    expect(screen.getByRole('button', { name: /Comenzar en Business Helper/i })).toBeInTheDocument();
  });

  it('stays on the form when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await completeBothSteps();

    await waitFor(() =>
      expect(screen.getByText(/No se pudo conectar con el servidor/i)).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('continues to the dashboard on the demo deployment (503 BACKEND_NOT_CONFIGURED)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Esta operación requiere una base de datos configurada' },
      })
    );

    await completeBothSteps();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });
});

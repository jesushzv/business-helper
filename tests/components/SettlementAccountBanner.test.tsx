import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettlementAccountBanner } from '@/components/settlement/SettlementAccountBanner';

/**
 * #64 — the prompt an organization without a CLABE was never given.
 *
 * `app/auth/callback/route.ts` sends a user to onboarding only when they have
 * no organization at all, so an organization with `bank_clabe IS NULL` goes
 * straight to the dashboard and is never asked again. This banner is that
 * missing prompt; these tests pin both that it appears and that it stays quiet
 * when nothing is wrong.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SettlementAccountBanner', () => {
  it('warns the owner and links to the form when there is no CLABE', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accounts: [], role: 'owner' })
    );

    render(<SettlementAccountBanner />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Falta tu cuenta de cobro/i)).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Agregar mi CLABE/i });
    expect(cta).toHaveAttribute('href', '/onboarding');
  });

  it('stays hidden once the organization has an account', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        accounts: [
          {
            id: 'a1',
            label: 'BBVA',
            bank_name: 'BBVA México',
            clabe: '012180001234567899',
            account_holder: null,
            is_default: true,
            archived_at: null,
          },
        ],
        role: 'owner',
      })
    );

    render(<SettlementAccountBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays hidden when the organization could not be read', async () => {
    // A failed request is not evidence of a missing bank account, and a red
    // banner across a healthy tenant's dashboard on a network blip is its own
    // defect.
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: 'SERVER_ERROR' } }));

    render(<SettlementAccountBanner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tells a member to ask the owner instead of offering a form they cannot save', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accounts: [], role: 'member' })
    );

    render(<SettlementAccountBanner />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/propietario/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Agregar mi CLABE/i })).not.toBeInTheDocument();
  });

  it('does not render in the marketing demo', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    render(<SettlementAccountBanner />);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

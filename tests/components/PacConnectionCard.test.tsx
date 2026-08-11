import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PacConnectionCard } from '@/components/settings/PacConnectionCard';

/**
 * Connecting a PAC (#149) — the form that decides whether a tenant can invoice.
 *
 * The credential is write-only: it is sealed server-side and only its last four
 * characters ever come back. That makes this card easy to get subtly wrong in
 * the direction hard rule 1 names — announcing a connection the PAC never
 * verified — and impossible to check without rendering it, since the key never
 * appears in a response body to assert against.
 *
 * What each case asks is the owner's question: *am I able to invoice now, and
 * is what this card tells me true of the stored credential?*
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const keyInput = () => document.getElementById('pac_api_key') as HTMLInputElement;
const connectButton = () => screen.getByRole('button', { name: /Conectar mi PAC|Actualizar llave/i });

const LIVE_CONNECTION = {
  provider: 'facturapi',
  apiKeyHint: '9f2c',
  environment: 'live' as const,
  connectedAt: '2026-08-01T10:00:00Z',
};

/** The GET the card issues on mount. */
function loadWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(jsonResponse(status, body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('before a PAC is connected', () => {
  it('says plainly that no invoice can be issued yet', async () => {
    loadWith({ connection: null, folios: null, platformFallbackAvailable: false });
    render(<PacConnectionCard />);

    await screen.findByText(/Todavía no puedes emitir facturas CFDI/i);
    // Benefit language, not jargon: no "sealed", no "AES", no "encryption key".
    expect(screen.getByText(/Nunca almacenamos tus certificados SAT/i)).toBeTruthy();
  });

  it('offers the platform account as the alternative when there is one', async () => {
    loadWith({ connection: null, folios: null, platformFallbackAvailable: true });
    render(<PacConnectionCard />);

    await screen.findByText(/se timbran con la cuenta de Business Helper/i);
  });

  it('will not submit an empty key', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard />);

    await waitFor(() => expect((connectButton() as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(keyInput(), { target: { value: 'sk_live_abc123' } });
    expect((connectButton() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('connecting', () => {
  it('sends the key, then reports the connection the server stored', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard />);
    await waitFor(() => expect(keyInput()).toBeTruthy());

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { connection: LIVE_CONNECTION }));
    // The reload the card issues after a successful save.
    loadWith({ connection: LIVE_CONNECTION, folios: null });

    fireEvent.change(keyInput(), { target: { value: 'sk_live_abcdef9f2c' } });
    fireEvent.click(connectButton());

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ apiKey: 'sk_live_abcdef9f2c' });

    // Twice on purpose: the inline banner beside the field, and the confirmation
    // dialog. Both announce the *stored* connection, not the submission.
    await waitFor(() => expect(screen.getAllByText(/Tu PAC quedó conectado/i).length).toBe(2));
    // Only the hint comes back, and the typed key is dropped from state.
    expect(screen.getByText(/····9f2c/)).toBeTruthy();
    await waitFor(() => expect(keyInput().value).toBe(''));
  });

  it('does not claim a connection the PAC refused', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard />);
    await waitFor(() => expect(keyInput()).toBeTruthy());

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: { code: 'PAC_KEY_INVALID', message: 'Tu PAC rechazó la llave. Verifícala e intenta de nuevo.' },
      })
    );

    fireEvent.change(keyInput(), { target: { value: 'sk_live_equivocada' } });
    fireEvent.click(connectButton());

    await screen.findByText(/Tu PAC rechazó la llave/i);
    expect(screen.queryByText(/Tu PAC quedó conectado/i)).toBeNull();
    // The typed key stays put so it can be corrected rather than retyped.
    expect(keyInput().value).toBe('sk_live_equivocada');
  });

  it('reports a network failure as a failure', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard />);
    await waitFor(() => expect(keyInput()).toBeTruthy());

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(keyInput(), { target: { value: 'sk_live_abc123' } });
    fireEvent.click(connectButton());

    await screen.findByText(/No se pudo conectar tu PAC/i);
    expect(screen.queryByText(/quedó conectado/i)).toBeNull();
  });
});

describe('once connected', () => {
  it('warns that a sandbox key issues documents with no fiscal validity', async () => {
    loadWith({ connection: { ...LIVE_CONNECTION, environment: 'sandbox' }, folios: null });
    render(<PacConnectionCard />);

    await screen.findByText(/no tienen validez fiscal/i);
  });

  it('shows the folio ledger the plan actually has', async () => {
    loadWith({
      connection: LIVE_CONNECTION,
      folios: {
        included: 50,
        used: 12,
        purchased: 0,
        remaining: 38,
        period: 'agosto 2026',
        addOnPricePerFolio: 8,
      },
    });
    render(<PacConnectionCard />);

    await screen.findByText(/Folios de tu plan \(agosto 2026\)/i);
    expect(screen.getByText(/38 disponibles/)).toBeTruthy();
  });

  it('keeps the connection on screen when disconnecting fails', async () => {
    loadWith({ connection: LIVE_CONNECTION, folios: null });
    render(<PacConnectionCard />);
    const disconnect = await screen.findByRole('button', { name: /Desconectar/i });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo desconectar tu PAC' } })
    );
    fireEvent.click(disconnect);

    await screen.findByText('No se pudo desconectar tu PAC');
    // Still connected: the card must not show a disconnection that did not happen.
    expect(screen.getByText(/····9f2c/)).toBeTruthy();
  });

  it('confirms a disconnection only after the server accepted it', async () => {
    loadWith({ connection: LIVE_CONNECTION, folios: null });
    render(<PacConnectionCard />);
    const disconnect = await screen.findByRole('button', { name: /Desconectar/i });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { disconnected: true }));
    fireEvent.click(disconnect);

    await screen.findByText(/Tu PAC quedó desconectado/i);
    expect(screen.getByText(/conserva|conservan su folio fiscal/i)).toBeTruthy();
  });
});

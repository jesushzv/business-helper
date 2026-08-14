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

/**
 * Disconnecting now goes through a confirmation dialog (#99): the key is
 * write-only, so the action cannot be undone from inside the app. Both steps
 * are the user's path, so both belong in the helper rather than in each case.
 */
async function disconnect() {
  fireEvent.click(await screen.findByRole('button', { name: /^Desconectar$/i }));
  fireEvent.click(await screen.findByRole('button', { name: /Sí, desconectar/i }));
}

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

/**
 * #265 — a 403 is "we won't tell you", not "there is none".
 *
 * Both verbs on `/api/organization/pac` require `billing_management`, which
 * only the owner holds. This card swallowed the 403 and left `connection` null,
 * which the render read as *no PAC connected* — so a manager or accountant
 * looking at an organization with a live Facturapi key was told, in an amber
 * alert, that the business cannot invoice, and was handed a key form that
 * always refuses. It was the only settings card taking no role prop.
 */
describe('a viewer who may not manage the PAC credential', () => {
  it('is not told the organization has no PAC when the read was refused', async () => {
    loadWith({ error: { code: 'FORBIDDEN', message: 'Tu rol no permite esta acción' } }, 403);
    render(<PacConnectionCard />);

    await screen.findByText(/Solo el dueño de la cuenta puede conectar/i);
    // The fabricated fact: absent knowledge rendered as a known absence.
    expect(screen.queryByText(/Todavía no puedes emitir facturas CFDI/i)).toBeNull();
  });

  it('is not offered a key form the route will always refuse', async () => {
    loadWith({ error: { code: 'FORBIDDEN', message: 'Tu rol no permite esta acción' } }, 403);
    render(<PacConnectionCard />);

    await screen.findByText(/Solo el dueño de la cuenta puede conectar/i);
    expect(document.getElementById('pac_api_key')).toBeNull();
    expect(screen.queryByRole('button', { name: /Conectar mi PAC/i })).toBeNull();
  });

  it('withholds the form from a known non-owner before the route even answers', async () => {
    // The page knows the role already; it should not take a round trip and a
    // 403 to find out (the sibling cards all take `canEdit`).
    loadWith({ connection: null });
    render(<PacConnectionCard canEdit={false} />);

    await screen.findByText(/Solo el dueño de la cuenta puede conectar/i);
    expect(document.getElementById('pac_api_key')).toBeNull();
  });

  it('still shows the owner the form and the warning', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard canEdit />);

    await screen.findByText(/Todavía no puedes emitir facturas CFDI/i);
    expect(document.getElementById('pac_api_key')).toBeTruthy();
  });
});

describe('a read that failed is not a read that found nothing', () => {
  it('says nothing about the connection when the request errored', async () => {
    // Unknown is its own state (#64): warning a tenant with a live key that
    // they cannot invoice is as wrong as hiding that they cannot.
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<PacConnectionCard canEdit />);

    await screen.findByRole('alert');
    expect(screen.queryByText(/Todavía no puedes emitir facturas CFDI/i)).toBeNull();
  });
});

describe('before a PAC is connected', () => {
  it('says plainly that no invoice can be issued yet', async () => {
    loadWith({ connection: null });
    render(<PacConnectionCard />);

    await screen.findByText(/Todavía no puedes emitir facturas CFDI/i);
    // Benefit language, not jargon: no "sealed", no "AES", no "encryption key".
    expect(screen.getByText(/Nunca almacenamos tus certificados SAT/i)).toBeTruthy();
  });

  it('never offers stamping through a Business Helper account (#221 BYOK)', async () => {
    // Even against a stale deployment still reporting the retired fallback
    // flag, the card must not promise the platform will stamp for the tenant.
    loadWith({ connection: null, folios: null, platformFallbackAvailable: true });
    render(<PacConnectionCard />);

    await screen.findByText(/Todavía no puedes emitir facturas CFDI/i);
    expect(screen.queryByText(/cuenta de Business Helper/i)).toBeNull();
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
    loadWith({ connection: LIVE_CONNECTION });

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
    loadWith({ connection: { ...LIVE_CONNECTION, environment: 'sandbox' } });
    render(<PacConnectionCard />);

    await screen.findByText(/no tienen validez fiscal/i);
  });

  it('asks before disconnecting, and sends nothing until confirmed', async () => {
    loadWith({ connection: LIVE_CONNECTION });
    render(<PacConnectionCard />);

    fireEvent.click(await screen.findByRole('button', { name: /^Desconectar$/i }));

    // The dialog states what cannot be undone: the key is never shown back.
    await screen.findByText(/tendrás que capturar de nuevo tu llave/i);
    // Only the mount GET so far — no DELETE on the strength of one tap.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the connection on screen when disconnecting fails', async () => {
    loadWith({ connection: LIVE_CONNECTION });
    render(<PacConnectionCard />);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo desconectar tu PAC' } })
    );
    await disconnect();

    await screen.findByText('No se pudo desconectar tu PAC');
    // Still connected: the card must not show a disconnection that did not happen.
    expect(screen.getByText(/····9f2c/)).toBeTruthy();
  });

  it('confirms a disconnection only after the server accepted it', async () => {
    loadWith({ connection: LIVE_CONNECTION });
    render(<PacConnectionCard />);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { disconnected: true }));
    await disconnect();

    await screen.findByText(/Tu PAC quedó desconectado/i);
    expect(screen.getByText(/conserva|conservan su folio fiscal/i)).toBeTruthy();
  });
});

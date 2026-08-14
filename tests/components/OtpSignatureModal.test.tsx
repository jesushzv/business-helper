import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OtpSignatureModal } from '@/components/quotes/OtpSignatureModal';

/**
 * The tenant's client's question, not the function's: *can I sign this?*
 *
 * Renders the modal and walks the whole happy path — request a code, type it,
 * submit — plus the copy that tells the signer where their code actually went.
 * The modal must not claim a destination ("su número celular") the server did
 * not use: since 2026-08-11 the launch channel is email, and the send response's
 * `channel` field is what the copy keys on.
 *
 * Was allowlisted as untested in formComponentsAreTested (#149); this file
 * removes that entry.
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function renderModal() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <OtpSignatureModal
      isOpen
      onClose={onClose}
      publicToken="tok-123"
      clientName="Don Roberto"
      onSuccess={onSuccess}
    />
  );
  return { onSuccess, onClose };
}

const sendButton = () => screen.getByRole('button', { name: /Enviar Código/i });
const codeInput = () => screen.getByPlaceholderText('123456') as HTMLInputElement;
const signButton = () => screen.getByRole('button', { name: /Firmar Cotización/i });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a signer can complete the OTP flow', () => {
  it('requests a code, accepts 6 digits, and hands the server seal to the caller', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ sent: true, channel: 'email', expires_in_seconds: 300 }))
      .mockResolvedValueOnce(jsonResponse({ success: true, contract_hash: 'seal-abc' }));

    const { onSuccess } = renderModal();

    fireEvent.click(sendButton());
    await waitFor(() => expect(codeInput()).toBeTruthy());

    fireEvent.change(codeInput(), { target: { value: '123456' } });
    fireEvent.click(signButton());

    await waitFor(() => expect(screen.getByText(/Firma Aceptada/i)).toBeTruthy());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('seal-abc'), { timeout: 3000 });

    // The verify call went to the signing route with the code the user typed.
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/quotes/public/tok-123');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      otpCode: '123456',
      clientName: 'Don Roberto',
    });
  });

  it('tells an email-channel signer to check their inbox, not their phone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sent: true, channel: 'email' }));

    renderModal();
    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(screen.getByText(/correo electrónico/i)).toBeTruthy();
    });
    expect(screen.queryByText(/celular/i)).toBeNull();
  });

  it('still says "celular" when the server sent over a deprecated phone channel', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sent: true, channel: 'sms' }));

    renderModal();
    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(screen.getByText(/número celular/i)).toBeTruthy();
    });
  });

  it('never claims a specific destination before the server has answered', () => {
    renderModal();
    // Pre-send copy is channel-neutral: the browser cannot know the channel yet.
    expect(screen.queryByText(/celular/i)).toBeNull();
    expect(screen.queryByText(/correo electrónico/i)).toBeNull();
  });

  it('shows the server message verbatim when issuing fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'CLIENT_EMAIL_MISSING', message: 'El cliente no tiene un correo electrónico registrado' } },
        false,
        422
      )
    );

    renderModal();
    fireEvent.click(sendButton());

    await waitFor(() => {
      expect(screen.getByText('El cliente no tiene un correo electrónico registrado')).toBeTruthy();
    });
    // Still on the request step: no code field appeared for a code that never went out.
    expect(screen.queryByPlaceholderText('123456')).toBeNull();
  });

  it('surfaces a verification rejection and the remaining attempts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ sent: true, channel: 'email' }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'OTP_INVALID', message: 'Código OTP incorrecto' }, remaining: 2 }, false, 400)
      );

    renderModal();
    fireEvent.click(sendButton());
    await waitFor(() => expect(codeInput()).toBeTruthy());

    fireEvent.change(codeInput(), { target: { value: '000000' } });
    fireEvent.click(signButton());

    await waitFor(() => expect(screen.getByText('Código OTP incorrecto')).toBeTruthy());
    expect(screen.getByText(/Intentos restantes: 2/i)).toBeTruthy();
  });
});

/**
 * #293 — a signature someone else performed is not this caller's success.
 *
 * The route used to answer `{ success: true, contract_hash, … }` for an
 * already-verified quote *before* checking the submitted code, and the modal
 * read any `success: true` as "¡Firma Aceptada con Éxito!" — so a junk code
 * POSTed against a signed quote showed a success screen for a signature the
 * caller did not perform. The route now answers 409 QUOTE_ALREADY_SIGNED with
 * the existing seal as data.
 */
describe('a quote someone already signed', () => {
  function renderWithAlreadySigned() {
    const onSuccess = vi.fn();
    const onAlreadySigned = vi.fn();
    render(
      <OtpSignatureModal
        isOpen
        onClose={vi.fn()}
        publicToken="tok-123"
        clientName="Don Roberto"
        onSuccess={onSuccess}
        onAlreadySigned={onAlreadySigned}
      />
    );
    return { onSuccess, onAlreadySigned };
  }

  async function reachVerifyAndSubmit(code = '000000') {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, channel: 'email' }));
    fireEvent.click(sendButton());
    await waitFor(() => expect(codeInput()).toBeTruthy());

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: { code: 'QUOTE_ALREADY_SIGNED', message: 'Esta cotización ya fue firmada.' },
          contract_hash: 'sha256:someone-elses-seal',
          accepted_at: '2026-08-01T10:00:00Z',
        },
        false,
        409
      )
    );
    fireEvent.change(codeInput(), { target: { value: code } });
    fireEvent.click(signButton());
  }

  it('never shows the success screen for a signature this caller did not perform', async () => {
    const { onSuccess } = renderWithAlreadySigned();
    await reachVerifyAndSubmit();

    await screen.findByText(/ya fue firmada/i);
    expect(screen.queryByText(/¡Firma Aceptada con Éxito!/i)).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('hands the existing seal to the page so it can swap to its sealed view', async () => {
    const { onAlreadySigned } = renderWithAlreadySigned();
    await reachVerifyAndSubmit();

    await waitFor(() =>
      expect(onAlreadySigned).toHaveBeenCalledWith('sha256:someone-elses-seal')
    );
  });

  it('passes null for a legacy row whose seal was never stored', async () => {
    // The old edge: `success: true` with `contract_hash: null` rendered no
    // success block, no error, and left the page on the unsigned view.
    const onAlreadySigned = vi.fn();
    render(
      <OtpSignatureModal
        isOpen
        onClose={vi.fn()}
        publicToken="tok-123"
        clientName="Don Roberto"
        onSuccess={vi.fn()}
        onAlreadySigned={onAlreadySigned}
      />
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, channel: 'email' }));
    fireEvent.click(sendButton());
    await waitFor(() => expect(codeInput()).toBeTruthy());

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'QUOTE_ALREADY_SIGNED', message: 'Esta cotización ya fue firmada.' } },
        false,
        409
      )
    );
    fireEvent.change(codeInput(), { target: { value: '000000' } });
    fireEvent.click(signButton());

    await screen.findByText(/ya fue firmada/i);
    expect(onAlreadySigned).toHaveBeenCalledWith(null);
  });
});

/**
 * #160 — the rate-limit wait must be visible.
 *
 * The OTP route's 429s carry `retry_after_seconds` on the body root (#65's
 * extras), and the modal rendered only "espere un momento": the signer had no
 * idea whether that meant 30 seconds or an hour, and each re-tap against the
 * invisible timer extended their own backoff. The server's number now drives
 * the countdown that disables the button.
 */
describe('the rate-limit wait is visible (#160)', () => {
  it('disables sending with a countdown taken from retry_after_seconds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'OTP_RESEND_COOLDOWN',
            message: 'Espere un momento antes de solicitar otro código.',
          },
          retry_after_seconds: 90,
        },
        false,
        429
      )
    );

    renderModal();
    fireEvent.click(sendButton());

    // The server's message renders, and the wait is a number, not a mystery —
    // minutes-scale waits format as m:ss.
    await screen.findByText(/Espere un momento/i);
    const button = screen.getByRole('button', {
      name: /Podrá solicitar otro código en 1:30/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('re-enables the button when the server wait runs out', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: { code: 'OTP_RESEND_COOLDOWN', message: 'Espere un momento.' },
          retry_after_seconds: 2,
        },
        false,
        429
      )
    );

    renderModal();
    fireEvent.click(sendButton());

    await screen.findByText(/en 2s/i);
    await waitFor(
      () =>
        expect(
          (screen.getByRole('button', { name: /Enviar Código de Verificación/i }) as HTMLButtonElement)
            .disabled
        ).toBe(false),
      { timeout: 4000 }
    );
  });

  it('shows the message verbatim with no countdown when waiting would not help', async () => {
    // The per-quote lifetime cap answers with no retry_after_seconds: a timer
    // would promise a retry the server will never grant.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'OTP_RATE_LIMITED',
            message: 'Ya no se pueden enviar más códigos para esta cotización.',
          },
        },
        false,
        429
      )
    );

    renderModal();
    fireEvent.click(sendButton());

    await screen.findByText(/más códigos para esta cotización/i);
    const button = screen.getByRole('button', {
      name: /Enviar Código de Verificación/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(/Podrá solicitar otro código en/i)).toBeNull();
  });
});

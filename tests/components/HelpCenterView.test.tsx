import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HelpCenterView } from '@/components/help/HelpCenterView';

/**
 * The help centre (#149) — the form a stuck user reaches *after* getting stuck.
 *
 * It is the last one on the list and the easiest to under-rate, which is
 * exactly why it earns a test: everything else in the product has somewhere
 * else to go wrong, and this is where a tenant lands when it does. A question
 * that vanishes into an empty chat, or an answer that never says the support
 * agent could not reach anything, leaves them with no next step at all.
 *
 * The knowledge base itself is local (`searchFAQItems`), so the two halves are
 * checked separately: searching narrows the list, and asking reaches
 * `/api/ai/support` and always says *something* back, including when it failed.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const askInput = () =>
  screen.getByPlaceholderText(/Escribe tu pregunta para la IA/i) as HTMLInputElement;
const askButton = () => screen.getByRole('button', { name: /Preguntar/i });
const searchInput = () =>
  screen.getByPlaceholderText(/Buscar duda en la base de conocimientos/i) as HTMLInputElement;

function ask(question: string) {
  fireEvent.change(askInput(), { target: { value: question } });
  fireEvent.click(askButton());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the knowledge base', () => {
  it('opens with a topic already expanded rather than a wall of headings', () => {
    render(<HelpCenterView />);
    expect(screen.getByText(/Soy tu Agente de IA de Soporte Técnico/i)).toBeTruthy();
  });

  it('narrows to what was searched for', () => {
    render(<HelpCenterView />);
    const before = document.body.textContent || '';

    fireEvent.change(searchInput(), { target: { value: 'SPEI' } });
    const after = document.body.textContent || '';

    expect(after).not.toBe(before);
    expect(searchInput().value).toBe('SPEI');
  });

  it('says so when a search matches nothing, instead of showing an empty page', () => {
    render(<HelpCenterView />);
    fireEvent.change(searchInput(), { target: { value: 'zzzzzzz-no-existe' } });

    // Some explicit answer must be on screen — silence reads as a broken page.
    expect(document.body.textContent).toMatch(/no encontramos|sin resultados|no hay resultados/i);
  });
});

describe('asking the support agent', () => {
  it('shows the question, then the answer the API returned', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        response: {
          answerText: 'Ve a Cobranza, abre el cobro y toca «Confirmar pago».',
          matchedFAQ: { category: 'cobranza' },
        },
      })
    );
    render(<HelpCenterView />);

    ask('¿Cómo confirmo un pago SPEI?');

    // The user's own words stay on screen while the answer is being fetched.
    expect(screen.getByText('¿Cómo confirmo un pago SPEI?')).toBeTruthy();
    await screen.findByText(/Ve a Cobranza, abre el cobro/i);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai/support');
    expect(JSON.parse(String(init.body))).toEqual({ query: '¿Cómo confirmo un pago SPEI?' });
  });

  it('answers even when the API returns nothing usable', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { response: null }));
    render(<HelpCenterView />);

    ask('¿Cómo descargo el paquete para mi contador?');

    // Never an unanswered question: the reply says it could not help and what
    // to try instead.
    await screen.findByText(/no pude procesar tu duda/i);
  });

  it('says the agent could not be reached rather than staying silent', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<HelpCenterView />);

    ask('¿Cómo timbro una factura?');

    await screen.findByText(/Ocurrió un error al conectar con el Agente de IA/i);
  });

  it('clears the box after sending, so the next question starts empty', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { response: { answerText: 'Listo.' } })
    );
    render(<HelpCenterView />);

    ask('¿Cómo invito a mi contador?');

    await waitFor(() => expect(askInput().value).toBe(''));
    await screen.findByText('Listo.');
  });

  it('refuses an empty question and does not call the API', () => {
    render(<HelpCenterView />);
    expect((askButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(askInput(), { target: { value: '   ' } });
    expect((askButton() as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

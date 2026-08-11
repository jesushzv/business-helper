import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIAssistantCard } from '@/components/assistant/AIAssistantCard';

/**
 * The operations assistant (#149).
 *
 * This card once answered every question from a fixed sample ledger — "Grupo
 * Salinas debe $45,000" — so a signed-in owner asking about their own
 * collections was shown numbers belonging to nobody, presented as an AI reading
 * their business. The hook now calls `/api/ai/assistant` for real tenants and
 * keeps the sample book only for the no-backend marketing demo.
 *
 * Rendering the card is the only way to check the half that matters to the
 * user: that a real tenant's answer comes from the API, that a demo answer is
 * *labelled* as an example, and that a failed question says so instead of
 * leaving the box empty (LESSONS — a bare catch is where fixtures leak in).
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const askInput = () => screen.getByPlaceholderText(/Escribe tu pregunta/i) as HTMLInputElement;
const send = () => screen.getByRole('button', { name: /Enviar pregunta/i });

const REAL_ANSWER = {
  query: '¿Qué cliente me debe más?',
  intent: 'top_debtor',
  matchedClient: 'Constructora del Bajío',
  totalOverdue: 18400,
  answerText: 'Constructora del Bajío te debe $18,400.00 MXN, vencido hace 12 días.',
  whatsappUrl: 'https://wa.me/528112223344?text=Hola',
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('a real tenant’s question is answered from their own records', () => {
  it('asks the API and renders what it returned', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, REAL_ANSWER));
    render(<AIAssistantCard />);

    fireEvent.change(askInput(), { target: { value: '¿Qué cliente me debe más?' } });
    fireEvent.click(send());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ai/assistant');
    expect(JSON.parse(String(init.body))).toEqual({ query: '¿Qué cliente me debe más?' });

    await screen.findByText(/Constructora del Bajío te debe \$18,400\.00 MXN/);
    // No "Ejemplo" badge: this answer is the tenant's own data.
    expect(screen.queryByText('Ejemplo')).toBeNull();
    expect(screen.getByText(/Las respuestas se calculan con reglas sobre tus clientes/i)).toBeTruthy();
  });

  it('says a failed question failed instead of leaving the feed blank', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'SERVER_ERROR', message: 'El asistente no está disponible.' } })
    );
    render(<AIAssistantCard />);

    fireEvent.change(askInput(), { target: { value: '¿Cuáles pagos vencen hoy?' } });
    fireEvent.click(send());

    await screen.findByText('El asistente no está disponible.');
    // And it does not invent an answer from the sample ledger to fill the gap.
    expect(screen.queryByText(/Grupo Salinas/i)).toBeNull();
  });

  it('reports a network failure rather than swallowing it', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<AIAssistantCard />);

    fireEvent.change(askInput(), { target: { value: '¿Cuánto hemos cobrado este mes?' } });
    fireEvent.click(send());

    await screen.findByText(/No se pudo procesar tu consulta/i);
    expect(screen.queryByText(/te debe/i)).toBeNull();
  });

  it('refuses to send an empty question', () => {
    render(<AIAssistantCard />);
    expect((send() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(askInput(), { target: { value: '   ' } });
    expect((send() as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends a suggested question with one tap, like typing it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, REAL_ANSWER));
    render(<AIAssistantCard />);

    fireEvent.click(screen.getByRole('button', { name: '¿Qué cliente me debe más?' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/Constructora del Bajío te debe/);
  });
});

describe('the sample ledger stays inside the marketing demo', () => {
  it('labels every demo answer as an example and never calls the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    render(<AIAssistantCard />);

    expect(screen.getByText(/las respuestas usan un negocio de ejemplo/i)).toBeTruthy();

    fireEvent.change(askInput(), { target: { value: '¿Cuánto me debe Grupo Salinas?' } });
    fireEvent.click(send());

    await screen.findByText('Ejemplo');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

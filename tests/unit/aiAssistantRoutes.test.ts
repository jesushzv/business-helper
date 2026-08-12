import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Behavioral contract for the two AI routes now that a model is in the loop:
 * `engine` names whichever engine actually wrote `answerText`. The figures
 * (matched client, totals, WhatsApp link) always come from the rules engine
 * over the tenant's records — Gemini writes prose, never a number's source —
 * and any Gemini failure degrades to the deterministic answer, labeled
 * `engine: 'rules'` and reported to Sentry, never a 500 and never an answer
 * passed off as the model's.
 */

let userCounter = 0;

vi.mock('@/lib/apiAuth', () => ({
  // Fresh user id per call so the real in-memory rate limiter never trips.
  requireOrgAccess: vi.fn(async () => ({
    ok: true,
    ctx: { supabase: {}, userId: `user-${++userCounter}`, organizationId: 'org-1', role: 'owner' },
  })),
  requireUser: vi.fn(async () => ({ ok: true, userId: `user-${++userCounter}`, supabase: {} })),
}));

vi.mock('@/lib/aiOrgContext', () => ({
  loadAIOrgContext: vi.fn(async () => ({
    clients: [{ id: 'c1', name: 'Constructora Maya', phone: '8112223344' }],
    receivables: [{ id: 'm1', clientId: 'c1', amount: 45000, status: 'pending', label: 'Anticipo' }],
  })),
}));

vi.mock('@/lib/geminiClient', () => ({
  isGeminiConfigured: vi.fn(() => true),
  generateGeminiText: vi.fn(),
  GeminiUnavailableError: class GeminiUnavailableError extends Error {},
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(() => ({ handled: true })),
}));

import { POST as assistantPOST } from '@/app/api/ai/assistant/route';
import { POST as supportPOST } from '@/app/api/ai/support/route';
import { isGeminiConfigured, generateGeminiText } from '@/lib/geminiClient';
import { captureException } from '@/lib/sentry';

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(isGeminiConfigured).mockReturnValue(true);
  vi.mocked(generateGeminiText).mockReset();
  vi.mocked(captureException).mockClear();
});

describe('POST /api/ai/assistant with Gemini configured', () => {
  it('labels a model answer engine: gemini and keeps the figures rules-computed', async () => {
    vi.mocked(generateGeminiText).mockResolvedValueOnce('Constructora Maya te debe $45,000.00 MXN en un hito.');

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto debe Constructora Maya?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('gemini');
    expect(data.answerText).toBe('Constructora Maya te debe $45,000.00 MXN en un hito.');
    // Money and links never come from the model.
    expect(data.totalOverdue).toBe(45000);
    expect(data.matchedClient).toBe('Constructora Maya');
    expect(data.whatsappUrl).toContain('wa.me');
    // The model was grounded: the prompt pins the tenant's verified figures.
    const prompt = vi.mocked(generateGeminiText).mock.calls[0][0];
    expect(prompt).toContain('Constructora Maya');
    expect(prompt).toContain('45,000.00');
    expect(prompt).toContain('ÚNICAMENTE');
  });

  it('degrades to the labeled rules answer when Gemini fails, and reports the failure', async () => {
    vi.mocked(generateGeminiText).mockRejectedValueOnce(new Error('Gemini respondió 503'));

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto debe Constructora Maya?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.answerText).toContain('saldo pendiente');
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
  });

  it('never calls the model when the key is unset', async () => {
    vi.mocked(isGeminiConfigured).mockReturnValue(false);

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto me deben?' }));
    const data = await response.json();

    expect(data.engine).toBe('rules');
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
  });

  it('keeps the human-handoff answer deterministic even with the model available', async () => {
    const response = await assistantPOST(
      request('/api/ai/assistant', { query: 'Quiero hablar con un asesor humano' })
    );
    const data = await response.json();

    expect(data.intent).toBe('human_handoff_request');
    expect(data.engine).toBe('rules');
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/support with Gemini configured', () => {
  it('labels a model answer and keeps the FAQ grounding in the prompt', async () => {
    vi.mocked(generateGeminiText).mockResolvedValueOnce('Para crear una cotización entra a Cotizaciones y presiona Nueva.');

    const response = await supportPOST(request('/api/ai/support', { query: '¿Cómo creo una cotización?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('gemini');
    expect(data.response.answerText).toBe('Para crear una cotización entra a Cotizaciones y presiona Nueva.');
    expect(vi.mocked(generateGeminiText).mock.calls[0][0]).toContain('FAQ');
  });

  it('degrades to the labeled rules answer when Gemini fails', async () => {
    vi.mocked(generateGeminiText).mockRejectedValueOnce(new Error('timeout'));

    const response = await supportPOST(request('/api/ai/support', { query: '¿Cómo creo una cotización?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.response.answerText).toContain('COTIZACIONES');
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
  });
});

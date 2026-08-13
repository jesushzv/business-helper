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

// The model budget is server-derived (#228): tier from the organization row,
// usage from the service-only ledger. Mocked per test to steer the gate.
vi.mock('@/lib/aiUsage', () => ({
  resolveAIModelBudget: vi.fn(),
  recordModelAnswer: vi.fn(async () => true),
}));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: vi.fn(() => true),
  createServiceClient: vi.fn(() => ({})),
}));

import { POST as assistantPOST } from '@/app/api/ai/assistant/route';
import { POST as supportPOST } from '@/app/api/ai/support/route';
import { requireOrgAccess } from '@/lib/apiAuth';
import { isGeminiConfigured, generateGeminiText } from '@/lib/geminiClient';
import { resolveAIModelBudget, recordModelAnswer } from '@/lib/aiUsage';
import { isServiceRoleConfigured } from '@/lib/supabase/service';
import { captureException } from '@/lib/sentry';

function openBudget(used = 3, limit = 300) {
  return {
    quota: { allowed: true, remaining: limit - used, limit, tier: 'negocio' },
    used,
  };
}

function exhaustedBudget(limit = 50) {
  return {
    quota: { allowed: false, remaining: 0, limit, tier: 'inicial', reason: 'Has alcanzado tu límite mensual' },
    used: limit,
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(isGeminiConfigured).mockReturnValue(true);
  vi.mocked(isServiceRoleConfigured).mockReturnValue(true);
  vi.mocked(generateGeminiText).mockReset();
  vi.mocked(resolveAIModelBudget).mockReset();
  vi.mocked(resolveAIModelBudget).mockResolvedValue(openBudget());
  vi.mocked(recordModelAnswer).mockClear();
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
    // Exactly one model answer, exactly one count against the ledger.
    expect(vi.mocked(recordModelAnswer)).toHaveBeenCalledTimes(1);
    expect(data.quota.tier).toBe('negocio');
  });

  it('degrades to the labeled rules answer when Gemini fails, and reports the failure', async () => {
    vi.mocked(generateGeminiText).mockRejectedValueOnce(new Error('Gemini respondió 503'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto debe Constructora Maya?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.answerText).toContain('saldo pendiente');
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
    // The reason must also reach stdout (Vercel logs): with Sentry configured
    // the degradation was otherwise invisible outside the Sentry dashboard.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Gemini no disponible'), 'Gemini respondió 503');
    // A failed model call is not a model answer — it must not be billed.
    expect(vi.mocked(recordModelAnswer)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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

describe('the model budget is the server’s, not the caller’s (#228)', () => {
  it('answers from rules when the monthly allowance is spent — no model call, no 403', async () => {
    vi.mocked(resolveAIModelBudget).mockResolvedValue(exhaustedBudget());

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto me deben?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.quota.allowed).toBe(false);
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
    expect(vi.mocked(recordModelAnswer)).not.toHaveBeenCalled();
  });

  it('ignores tierKey and currentUsage from the request body', async () => {
    vi.mocked(resolveAIModelBudget).mockResolvedValue(exhaustedBudget());

    // The self-report that used to buy unlimited model calls.
    const response = await assistantPOST(
      request('/api/ai/assistant', { query: '¿Cuánto me deben?', tierKey: 'empresa', currentUsage: 0 })
    );
    const data = await response.json();

    expect(data.engine).toBe('rules');
    expect(data.quota.tier).toBe('inicial');
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
  });

  it('treats an unknown budget as no budget: rules answer, no token spend, no refusal', async () => {
    vi.mocked(resolveAIModelBudget).mockResolvedValue(null);

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto me deben?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.quota).toBeNull();
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
  });

  it('never consults the ledger without a service role — and never calls the model', async () => {
    vi.mocked(isServiceRoleConfigured).mockReturnValue(false);

    const response = await assistantPOST(request('/api/ai/assistant', { query: '¿Cuánto me deben?' }));
    const data = await response.json();

    expect(data.engine).toBe('rules');
    expect(vi.mocked(resolveAIModelBudget)).not.toHaveBeenCalled();
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

  it('gives a caller with no organization the FAQ answer, never an unmetered model call', async () => {
    vi.mocked(requireOrgAccess).mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 401 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = await supportPOST(request('/api/ai/support', { query: '¿Cómo creo una cotización?' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.engine).toBe('rules');
    expect(data.response.answerText).toContain('COTIZACIONES');
    expect(vi.mocked(resolveAIModelBudget)).not.toHaveBeenCalled();
    expect(vi.mocked(generateGeminiText)).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateGeminiText,
  isGeminiConfigured,
  geminiModel,
  geminiGenerationConfig,
  GeminiUnavailableError,
} from '@/lib/geminiClient';

const KEY = 'AIza-test-key-for-spec';

function envWithKey(overrides: Record<string, string | undefined> = {}) {
  return { GEMINI_API_KEY: KEY, ...overrides };
}

function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('Gemini client configuration', () => {
  it('reports unconfigured when the key is absent and configured when present', () => {
    expect(isGeminiConfigured({})).toBe(false);
    expect(isGeminiConfigured({ GEMINI_API_KEY: '' })).toBe(false);
    expect(isGeminiConfigured(envWithKey())).toBe(true);
  });

  it('defaults to the rolling -latest alias unless GEMINI_MODEL overrides it', () => {
    // The pinned gemini-2.5-flash id began returning 404 for new API keys in
    // July 2026 — the alias is what keeps a hardcoded default from rotting.
    expect(geminiModel({})).toBe('gemini-flash-latest');
    expect(geminiModel({ GEMINI_MODEL: 'gemini-2.5-pro' })).toBe('gemini-2.5-pro');
  });

  // Thought tokens spend maxOutputTokens before any visible text: with the
  // old 512-token budget and no thinkingConfig, live calls came back as an
  // empty candidate (finishReason: MAX_TOKENS), so every assistant answer
  // silently degraded to the rules engine. Each API generation caps thinking
  // its own way: 2.5 flash takes thinkingBudget 0, 2.5 pro refuses a zero
  // budget, and Gemini 3+/the aliases take the thinkingLevel enum instead
  // (with temperature left at its default, per Google's 3.x guidance).
  it('caps thinking per model generation', () => {
    expect(geminiGenerationConfig('gemini-2.5-flash')).toMatchObject({
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(geminiGenerationConfig('gemini-2.5-pro')).not.toHaveProperty('thinkingConfig');
    expect(geminiGenerationConfig('gemini-flash-latest')).toEqual({
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiGenerationConfig('gemini-3.6-flash')).toMatchObject({
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(geminiGenerationConfig('gemini-3.6-flash')).not.toHaveProperty('temperature');
  });
});

describe('generateGeminiText', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails closed without a key: throws before any network call', async () => {
    await expect(generateGeminiText('hola', {})).rejects.toBeInstanceOf(GeminiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the candidate text and keeps the key out of the URL', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('Respuesta del modelo.'));

    const text = await generateGeminiText('hola', envWithKey());

    expect(text).toBe('Respuesta del modelo.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-flash-latest:generateContent');
    // The key travels in a header only — a URL lands in request logs.
    expect(String(url)).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    // The wire request must cap thinking: without it the token budget is
    // spent on thoughts and the answer arrives empty (MAX_TOKENS).
    const body = JSON.parse(init.body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(1024);
  });

  it('names MAX_TOKENS when the candidate has thoughts but no text', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: {}, finishReason: 'MAX_TOKENS' }] }),
        { status: 200 }
      )
    );

    const error = await generateGeminiText('hola', envWithKey()).catch((e) => e);
    expect(error).toBeInstanceOf(GeminiUnavailableError);
    expect(error.message).toContain('MAX_TOKENS');
  });

  it('throws on a non-2xx answer, naming the status but never the key', async () => {
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));

    const error = await generateGeminiText('hola', envWithKey()).catch((e) => e);
    expect(error).toBeInstanceOf(GeminiUnavailableError);
    expect(error.message).toContain('403');
    expect(error.message).not.toContain(KEY);
  });

  it('throws when the answer carries no text candidate', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 })
    );

    await expect(generateGeminiText('hola', envWithKey())).rejects.toBeInstanceOf(GeminiUnavailableError);
  });

  it('wraps a transport failure instead of leaking it', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(generateGeminiText('hola', envWithKey())).rejects.toBeInstanceOf(GeminiUnavailableError);
  });
});

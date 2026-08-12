import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateGeminiText,
  isGeminiConfigured,
  geminiModel,
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

  it('uses the default model unless GEMINI_MODEL overrides it', () => {
    expect(geminiModel({})).toBe('gemini-2.5-flash');
    expect(geminiModel({ GEMINI_MODEL: 'gemini-2.5-pro' })).toBe('gemini-2.5-pro');
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
    expect(String(url)).toContain('/models/gemini-2.5-flash:generateContent');
    // The key travels in a header only — a URL lands in request logs.
    expect(String(url)).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
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

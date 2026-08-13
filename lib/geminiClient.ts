/**
 * Gemini client — raw REST, like every other provider here (Sentry is the
 * only SDK installed; the `@google/genai` package some docs mention was never
 * added).
 *
 * Fail-closed: an unset `GEMINI_API_KEY`, a non-2xx answer, a timeout or an
 * empty candidate all throw `GeminiUnavailableError`. This module never
 * returns a fabricated answer; the caller decides whether to surface the
 * failure or answer from the rules engine instead — and whichever engine
 * answers must be the one the response names.
 *
 * The API key travels in the `x-goog-api-key` header, never the URL, so it
 * cannot end up in a request log or a thrown error message.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// The rolling alias, not a pinned id: `gemini-2.5-flash` started returning 404
// for new API keys in July 2026 (retired ahead of its October shutdown), which
// is how every assistant answer silently degraded to the rules engine. Google
// publishes `-latest` aliases exactly so a hardcoded model id cannot rot into
// a 404; the cost is that behavior shifts when Google re-points the alias.
// Pin a specific model via GEMINI_MODEL if that trade ever goes the other way.
const DEFAULT_MODEL = 'gemini-flash-latest';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 2048;

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export function isGeminiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export function geminiModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Gemini models think by default, and thought tokens spend `maxOutputTokens`
 * before any visible text does — a short budget comes back as an empty
 * candidate with `finishReason: MAX_TOKENS`, which this client (correctly)
 * treats as a failure, so every answer degrades to the rules engine. The
 * assistant only needs short prose around pre-computed figures, so thinking is
 * held to the minimum each generation takes:
 *
 * - Gemini 2.5 era: `thinkingBudget: 0` disables it (except pro models, which
 *   refuse a zero budget — there the token ceiling is the only guard), and
 *   `temperature` is honored.
 * - Gemini 3+ (and the `-latest` aliases, which resolve there): the API
 *   replaced `thinkingBudget` with the enum `thinkingLevel` — `'low'` is the
 *   floor every 3.x model accepts — and Google advises leaving `temperature`
 *   at its default, so it is omitted.
 */
export function geminiGenerationConfig(model: string): Record<string, unknown> {
  if (model.includes('2.5')) {
    const config: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS };
    if (!model.includes('pro')) {
      config.thinkingConfig = { thinkingBudget: 0 };
    }
    return config;
  }
  return { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: 'low' } };
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: GeminiCandidatePart[] };
    finishReason?: string;
  }>;
}

/**
 * One `generateContent` call. Returns the model's text or throws
 * `GeminiUnavailableError` — there is no in-between result.
 */
export async function generateGeminiText(
  prompt: string,
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiUnavailableError('GEMINI_API_KEY no está configurada');
  }

  const model = geminiModel(env);
  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: geminiGenerationConfig(model),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'error de red';
    throw new GeminiUnavailableError(`Gemini no respondió (${reason})`);
  }

  if (!response.ok) {
    // The body can carry Google's error prose; the status alone is what we
    // need and the safe thing to propagate.
    throw new GeminiUnavailableError(`Gemini respondió ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as GeminiGenerateResponse | null;
  const candidate = payload?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new GeminiUnavailableError(
      `Gemini no devolvió texto (finishReason: ${candidate?.finishReason || 'desconocido'})`
    );
  }

  return text;
}

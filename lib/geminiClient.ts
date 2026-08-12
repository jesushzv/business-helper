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
const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 15_000;

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

  let response: Response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/models/${geminiModel(env)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
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

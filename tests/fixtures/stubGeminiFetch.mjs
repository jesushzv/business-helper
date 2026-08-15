/**
 * A `fetch` stub injected into `scripts/verify-gemini.mjs` via `node --import`,
 * so the script's *verdict* can be tested without a Google API key.
 *
 * Loaded from outside the script rather than through an env var it reads, for
 * the same reason as `stubProviderFetch.mjs`: a `GEMINI_API_BASE`-style seam in
 * the script would be one config flip away from pointing a real run at
 * something that always says yes — the class of hole #63/#118 exist to close.
 *
 * `BH_STUB_MODE` selects which provider behaviour to simulate. It is read here,
 * in the test harness, and never by the script.
 *
 *   healthy      — a real completion echoing the marker; garbage key refused
 *   empty        — HTTP 200 with no text (finishReason MAX_TOKENS), which is
 *                  what unbounded thinking actually returns
 *   accepts-any  — every key works, including the garbage one, so the negative
 *                  control has nothing to prove
 *   network      — the transport fails outright
 */

const MODE = process.env.BH_STUB_MODE || 'healthy';
const MARKER = 'BH-OK';
const GARBAGE_KEY = 'AIza-invalid-key-for-negative-control';

function json(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const completion = (text, finishReason = 'STOP') =>
  json({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

const refused = () => json({ error: { code: 400, message: 'API key not valid' } }, false, 400);

globalThis.fetch = async (input, init) => {
  const url = String(input);

  if (!url.includes('generativelanguage.googleapis.com')) {
    // Unstubbed call: fail loudly rather than let the script read a 404 as a pass.
    return json({ name: 'unstubbed_request', url }, false, 599);
  }

  if (MODE === 'network') {
    throw Object.assign(new Error('socket hang up'), { name: 'TypeError' });
  }

  const key = init?.headers?.['x-goog-api-key'];
  const isGarbage = key === GARBAGE_KEY;

  if (MODE === 'accepts-any') {
    // The endpoint every negative control exists to catch.
    return completion(MARKER);
  }

  if (isGarbage) return refused();

  if (MODE === 'empty') {
    return completion('', 'MAX_TOKENS');
  }

  return completion(MARKER);
};

#!/usr/bin/env node
/**
 * Verifies that the Gemini key on a deployment is real, before a tenant's
 * question is what discovers that it isn't.
 *
 * `lib/geminiClient.ts` is unit-tested against a mocked fetch, which proves
 * the code sends the right request — not that GEMINI_API_KEY exists, is
 * valid, or belongs to a project with the model enabled. Those are properties
 * of an environment, so they need a call to the provider. Run this wherever
 * the key is set (locally with the Vercel value, or `vercel env pull`):
 *
 *   GEMINI_API_KEY=AIza… npm run verify:gemini
 *
 * Three checks, and a run that cannot complete them exits NON-ZERO naming
 * what it skipped (#63/#118 — an incomplete verification never reads as a
 * pass):
 *
 *   1. Config          — GEMINI_API_KEY is set.
 *   2. Positive control — a real generateContent call must echo a marker
 *                         token, proving a completion happened, not just a 200.
 *   3. Negative control — the same call with a garbage key must be refused;
 *                         an endpoint that accepts any key verifies nothing.
 */

const env = process.env;
const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MARKER = 'BH-OK';

let failed = 0;

function record(name, passed, detail) {
  if (!passed) failed += 1;
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function generate(apiKey, promptText) {
  // Mirrors lib/geminiClient.ts's generationConfig: Gemini 2.5 thinks by
  // default and thought tokens spend maxOutputTokens before visible text, so
  // a small budget with thinking on returns an EMPTY candidate
  // (finishReason: MAX_TOKENS) — this script once had exactly that bug, so a
  // valid key could fail the positive control. Pro models refuse a zero
  // thinking budget; for those the default stands.
  const generationConfig = { temperature: 0, maxOutputTokens: 1024 };
  if (!MODEL.includes('pro')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  try {
    const response = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => ({}));
    const candidate = json?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();
    return { ok: response.ok, status: response.status, text, finishReason: candidate?.finishReason };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'network error';
    return { ok: false, status: 0, text: '', transport: reason };
  }
}

console.log(`\nGemini live verification (model: ${MODEL})\n`);

if (!env.GEMINI_API_KEY) {
  record('GEMINI_API_KEY is set', false, 'unset — checks 2 and 3 SKIPPED, this run proves nothing');
  console.error('\n✗ INCOMPLETE\n');
  process.exit(1);
}
record('GEMINI_API_KEY is set', true);

const positive = await generate(
  env.GEMINI_API_KEY,
  `Responde únicamente con el texto exacto: ${MARKER}`
);
record(
  `live completion echoes ${MARKER}`,
  positive.ok && positive.text.includes(MARKER),
  positive.ok
    ? `got: "${positive.text.slice(0, 60)}"${positive.text ? '' : ` (vacío, finishReason: ${positive.finishReason || 'desconocido'})`}`
    : `status ${positive.status}${positive.transport ? ` (${positive.transport})` : ''}`
);

const negative = await generate('AIza-invalid-key-for-negative-control', 'hola');
record(
  'a garbage key is refused',
  !negative.ok && negative.status >= 400,
  `status ${negative.status}`
);

if (failed > 0) {
  console.error(`\n✗ ${failed} check(s) failed\n`);
  process.exit(1);
}
console.log('\n✓ Gemini responde en vivo con esta llave\n');

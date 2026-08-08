import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { publicApiError } from '@/lib/publicApiError';

/**
 * #65 — the public routes (the surfaces a *client* reaches over a shared
 * link) once answered four different error shapes, several in English:
 * "Quote not found", "Failed to issue verification code", and a `code`
 * sitting as a sibling of `error`. The consuming pages had to guess between
 * `error`, `error.message` and the sibling, which is how untranslated
 * strings reached a Spanish-speaking signer mid-firma.
 *
 * Every public error now flows through publicApiError() as
 * `{ error: { code, message } }` with a Spanish message. The scans below
 * were verified to fail before being trusted: a planted bare-string body
 * and a planted English message each turned the suite red (CLAUDE.md —
 * an assertion of absence must be shown to fail).
 */

const PUBLIC_ROUTE_FILES = [
  'app/api/quotes/public/[token]/route.ts',
  'app/api/quotes/public/[token]/otp/route.ts',
  'app/api/receivables/public/[token]/route.ts',
];

const sources = PUBLIC_ROUTE_FILES.map((file) => ({
  file,
  source: readFileSync(join(process.cwd(), file), 'utf8'),
}));

describe('publicApiError()', () => {
  it('answers { error: { code, message } } with the given status', async () => {
    const res = publicApiError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'QUOTE_NOT_FOUND', message: 'Cotización no encontrada' },
    });
  });

  it('carries extra body siblings without letting them override the envelope', async () => {
    const res = publicApiError(429, 'OTP_RESEND_COOLDOWN', 'Espere unos segundos', {
      retry_after_seconds: 12,
      error: 'must not survive',
    });
    const body = await res.json();
    expect(body.retry_after_seconds).toBe(12);
    // The envelope is spread last: an extra keyed `error` cannot replace it.
    expect(body.error).toEqual({ code: 'OTP_RESEND_COOLDOWN', message: 'Espere unos segundos' });
  });
});

describe('public route error bodies (#65)', () => {
  it.each(PUBLIC_ROUTE_FILES)('%s answers no bare-string error body', (file) => {
    const { source } = sources.find((s) => s.file === file)!;
    // `{ error: 'Quote not found' }` and friends — the pre-#65 shapes.
    expect(source).not.toMatch(/error:\s*['"`]/);
  });

  it.each(PUBLIC_ROUTE_FILES)('%s carries no `code` outside the envelope', (file) => {
    const { source } = sources.find((s) => s.file === file)!;
    // The fourth shape: `{ error: …, code: 'ORG_BANK_DETAILS_MISSING' }` with
    // the code as a sibling. Inside publicApiError the code is a positional
    // argument, never an object key, so any `code: 'X'` literal is a regression.
    expect(source).not.toMatch(/code:\s*['"][A-Z_]+['"]/);
  });

  it('every literal public error message is Spanish, not English', () => {
    // Capture publicApiError(status, 'CODE', 'literal message') calls,
    // including multi-line ones. Messages built from expressions
    // (delivery.error, reservation.error) are covered by the modules that
    // produce them — lib/otpDelivery and lib/otpRateLimit are Spanish.
    const captured: Array<{ file: string; message: string }> = [];
    for (const { file, source } of sources) {
      for (const match of source.matchAll(
        /publicApiError\(\s*\d+,\s*'[A-Z_]+',\s*'([^']+)'/g
      )) {
        captured.push({ file, message: match[1] });
      }
    }

    // A scan that matches nothing is indistinguishable from one that passes:
    // the three routes carry at least this many literal messages today, and
    // shrinking below it means the extraction regex broke, not the debt.
    expect(captured.length).toBeGreaterThanOrEqual(12);

    const englishFragments = [
      'not found',
      'failed',
      'unable',
      'invalid',
      'please',
      'try again',
      'quote',
      'verification code',
      'not configured',
      'server error',
    ];
    for (const { file, message } of captured) {
      const lower = message.toLowerCase();
      for (const fragment of englishFragments) {
        expect(lower, `${file}: "${message}" contains English fragment "${fragment}"`).not.toContain(
          fragment
        );
      }
    }
  });

  it('the consumers read error.message, never the bare error', () => {
    const modal = readFileSync(
      join(process.cwd(), 'components/quotes/OtpSignatureModal.tsx'),
      'utf8'
    );
    expect(modal).toContain('data?.error?.message');
    // `data?.error ||` renders "[object Object]" now that error is an envelope.
    expect(modal).not.toMatch(/data\?\.error\s*\|\|/);

    const payPage = readFileSync(join(process.cwd(), 'app/pay/[token]/page.tsx'), 'utf8');
    expect(payPage).toContain("'ORG_BANK_DETAILS_MISSING'");
    expect(payPage).toContain('data?.error?.message');
  });
});

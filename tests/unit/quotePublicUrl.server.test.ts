// @vitest-environment node
//
// Runs without jsdom so `typeof window === 'undefined'` — the branch that once
// hardcoded businesshelper.mx into every server-rendered quote link (#36).
// The jsdom (browser) branch is covered in tests/components/QuoteCard.test.tsx.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getQuotePublicUrl } from '@/lib/url';

const ENV_KEYS = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_VERCEL_URL', 'VERCEL_URL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
});

describe('getQuotePublicUrl (server-side)', () => {
  it('resolves against NEXT_PUBLIC_APP_URL, the configured origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.app';
    expect(getQuotePublicUrl('tok_abc123')).toBe('https://businesshelper.app/q/tok_abc123');
  });

  it('falls back to the Vercel preview origin when no app URL is set', () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = 'preview-abc.vercel.app';
    expect(getQuotePublicUrl('tok_abc123')).toBe('https://preview-abc.vercel.app/q/tok_abc123');
  });

  it('never emits a hardcoded host — an unconfigured environment yields localhost, not an unowned domain', () => {
    const url = getQuotePublicUrl('tok_abc123');
    expect(url).toBe('http://localhost:3000/q/tok_abc123');
    expect(url).not.toContain('businesshelper.mx');
  });
});

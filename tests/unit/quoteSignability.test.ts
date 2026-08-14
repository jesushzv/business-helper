import { describe, it, expect } from 'vitest';
import {
  isQuoteExpired,
  quoteSignableState,
  QUOTE_REFUSAL,
} from '@/lib/quoteSignability';

/**
 * #258 / #282 — one predicate for "may this quote still be signed".
 *
 * Expiry existed only as a column and two display sites: nothing compared
 * `valid_until` to today, so a quote priced in July could be OTP-signed in
 * September, minting "evidencia legal certificada" at stale prices. And the
 * public page ignored `status` entirely, offering a live sign button on
 * converted, rejected and draft quotes whose OTP request the server refuses.
 */

const TODAY = '2026-09-20';

describe('isQuoteExpired', () => {
  it('expires strictly after the stated day — "válida hasta" includes that day', () => {
    expect(isQuoteExpired('2026-09-20', TODAY)).toBe(false);
    expect(isQuoteExpired('2026-09-19', TODAY)).toBe(true);
    expect(isQuoteExpired('2026-10-01', TODAY)).toBe(false);
  });

  it('treats no expiry as no expiry', () => {
    // Inventing a deadline the tenant never set would block a signature they
    // want; open-ended is the pre-existing meaning of an empty column.
    expect(isQuoteExpired(null, TODAY)).toBe(false);
    expect(isQuoteExpired(undefined, TODAY)).toBe(false);
    expect(isQuoteExpired('', TODAY)).toBe(false);
    expect(isQuoteExpired('no-es-fecha', TODAY)).toBe(false);
  });

  it('reads a timestamp the way it reads a date', () => {
    expect(isQuoteExpired('2026-08-01T10:00:00Z', TODAY)).toBe(true);
  });
});

describe('quoteSignableState', () => {
  const base = { status: 'sent', valid_until: '2026-12-31', contract_hash: null };

  it('lets a live, in-window quote through', () => {
    expect(quoteSignableState(base, TODAY)).toBe('signable');
  });

  it('refuses an expired quote — the defect #258 names', () => {
    expect(quoteSignableState({ ...base, valid_until: '2026-08-01' }, TODAY)).toBe('expired');
  });

  it.each([
    ['converted', 'converted'],
    ['rejected', 'rejected'],
    ['draft', 'not_yet_sent'],
    ['expired', 'expired'],
  ])('maps status %s to %s', (status, expected) => {
    expect(quoteSignableState({ ...base, status }, TODAY)).toBe(expected);
  });

  it('reads a signed quote as signed even past its window', () => {
    // The signature already happened; "expired" would be false news.
    expect(
      quoteSignableState(
        { ...base, valid_until: '2026-08-01', contract_hash: 'sha256:abc' },
        TODAY
      )
    ).toBe('already_signed');
    expect(
      quoteSignableState({ ...base, status: 'accepted', client_otp_verified: true }, TODAY)
    ).toBe('already_signed');
  });

  it('treats an unknown status as not yet signable, never as open', () => {
    expect(quoteSignableState({ ...base, status: 'algo-nuevo' }, TODAY)).toBe('not_yet_sent');
  });
});

describe('the refusals the routes serve', () => {
  it('covers every non-signable state with Spanish, renderable copy', () => {
    for (const [state, refusal] of Object.entries(QUOTE_REFUSAL)) {
      expect(refusal.code, state).toBeTruthy();
      expect(refusal.message.length, state).toBeGreaterThan(20);
      // The reader is the tenant's client: no jargon, no English.
      expect(refusal.message).not.toMatch(/token|status|OTP|error/);
    }
  });

  it('answers already-signed with its own code, distinct from not-signable (#293)', () => {
    expect(QUOTE_REFUSAL.already_signed.code).toBe('QUOTE_ALREADY_SIGNED');
    expect(QUOTE_REFUSAL.expired.code).toBe('QUOTE_EXPIRED');
  });
});

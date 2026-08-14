import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkQuoteQuotaGate,
  monthStartISO,
  INICIAL_MONTHLY_QUOTE_LIMIT,
  QUOTE_QUOTA_CODE,
} from '@/lib/quoteQuota';
import { readFileSync } from 'node:fs';

/**
 * #271 — Plan Inicial's quota, decided at 50/mes and enforced.
 *
 * It was stated four different ways on the same pricing scroll (50/mes,
 * ilimitadas + 15 clientes, 25/mes) and no code enforced any of them: a copy
 * promise with no mechanism, and three of the four claims wrong whichever one
 * was true.
 */

/** A supabase mock: the org row and the count the gate will see. */
function supabaseWith(tier: string | null, count: number | null, opts: { orgError?: boolean; countError?: boolean } = {}) {
  return {
    from: (table: string) => {
      if (table === 'organizations') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () =>
            opts.orgError
              ? { data: null, error: { message: 'boom' } }
              : { data: { subscription_tier: tier }, error: null },
        };
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: async () =>
          opts.countError ? { count: null, error: { message: 'boom' } } : { count, error: null },
      };
      return chain;
    },
  };
}

describe('checkQuoteQuotaGate', () => {
  it('refuses the 51st quote of the month for an inicial org, in Spanish, with the remedy', async () => {
    const result = await checkQuoteQuotaGate(supabaseWith('inicial', 50), 'org-1');

    expect(result.ok).toBe(false);
    expect(result.code).toBe(QUOTE_QUOTA_CODE);
    expect(result.status).toBe(402);
    expect(result.message).toMatch(/50 cotizaciones/);
    expect(result.message).toMatch(/Plan Negocio/);
    expect(result.used).toBe(50);
    expect(result.limit).toBe(50);
  });

  it('allows quote 50 itself — the limit is inclusive', async () => {
    const result = await checkQuoteQuotaGate(supabaseWith('inicial', 49), 'org-1');
    expect(result.ok).toBe(true);
  });

  it.each(['negocio', 'empresa'])('never meters %s — they sell ilimitadas', async (tier) => {
    const result = await checkQuoteQuotaGate(supabaseWith(tier, 9999), 'org-1');
    expect(result.ok).toBe(true);
  });

  it('leaves a tierless (trialing) org to the trial gate', async () => {
    const result = await checkQuoteQuotaGate(supabaseWith(null, 9999), 'org-1');
    expect(result.ok).toBe(true);
  });

  it('answers unknown as allow when the org read fails (#64 posture)', async () => {
    const result = await checkQuoteQuotaGate(supabaseWith('inicial', 50, { orgError: true }), 'org-1');
    expect(result.ok).toBe(true);
  });

  it('answers unknown as allow when the count fails', async () => {
    const result = await checkQuoteQuotaGate(supabaseWith('inicial', null, { countError: true }), 'org-1');
    expect(result.ok).toBe(true);
  });

  /**
   * These three assertions used to read `…T00:00:00.000Z` — the UTC month, which
   * is the defect #334 fixes, pinned by its own test. The month a tenant is
   * counted against is the one Mexico City is in, so its first instant is
   * 06:00Z, and the boundary case is the one that matters: at 22:30 on 31
   * August the counter must still be August's.
   */
  it('counts from the first instant of the current month in the product timezone', () => {
    expect(monthStartISO(new Date('2026-08-14T03:00:00Z'))).toBe('2026-08-01T06:00:00.000Z');
    expect(monthStartISO(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01-01T06:00:00.000Z');
  });

  it('does not roll the quota over while it is still last month in Mexico', () => {
    // 22:30 on 31 August in Mexico City; UTC has already turned September.
    expect(monthStartISO(new Date('2026-09-01T04:30:00Z'))).toBe('2026-08-01T06:00:00.000Z');
    // 00:30 on 1 September there — now it rolls.
    expect(monthStartISO(new Date('2026-09-01T06:30:00Z'))).toBe('2026-09-01T06:00:00.000Z');
  });
});

/**
 * One number, everywhere it is stated. Re-derived from the sources, not a
 * hand-kept list (hard rule #7's fixture clause): every surface that mentions
 * a monthly quote quota must say the enforced limit, and the retired claims
 * must be gone.
 */
describe('the quota is stated once, identically (#271)', () => {
  const SURFACES = [
    'app/pricing/page.tsx',
    'app/page.tsx',
    'lib/stripe.ts',
    'lib/tierFeaturesData.ts',
  ];

  it('every quota claim carries the enforced number', () => {
    let claims = 0;
    for (const file of SURFACES) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(/Hasta \d+ cotizaciones/gi) || [];
      claims += matches.length;
      for (const claim of matches) {
        expect(claim, `${file}: "${claim}"`).toMatch(
          new RegExp(`Hasta ${INICIAL_MONTHLY_QUOTE_LIMIT} cotizaciones`, 'i')
        );
      }
    }
    // The scan must have actually found the claims it polices — a regex
    // matching nothing passes vacuously.
    expect(claims).toBeGreaterThanOrEqual(3);
  });

  it('the retired versions are gone', () => {
    for (const file of SURFACES) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} still claims 25/mes`).not.toMatch(/25 cotizaciones/i);
      expect(src, `${file} still caps clients at 15`).not.toMatch(/15 clientes/i);
    }
    // The Inicial tier card must not claim ilimitadas while the gate meters it.
    const tiers = readFileSync('lib/tierFeaturesData.ts', 'utf8');
    const inicialBlock = tiers.slice(tiers.indexOf("id: 'inicial'"), tiers.indexOf("id: 'pro'"));
    expect(inicialBlock).not.toMatch(/ilimitadas/i);
  });
});

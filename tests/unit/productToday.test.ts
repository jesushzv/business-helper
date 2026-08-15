import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PRODUCT_TIME_ZONE,
  productDayStartInstant,
  productMonthStr,
  productTodayStr,
} from '@/lib/dates';
import { isQuoteExpired, quoteSignableState } from '@/lib/quoteSignability';
import { parseNaturalLanguageQuery } from '@/lib/aiAssistant';
import { readFileSync } from 'node:fs';

/**
 * #334 — server-side "today" is the product's civil day, not UTC's.
 *
 * Every assertion here pins an instant in the **evening**, between 18:00 in
 * Mexico City and midnight UTC, because that is the only window where the two
 * answers differ. A test taken at midday passes with the bug fully present,
 * which is how three sites carried it for as long as they did.
 */

const EVENING = new Date('2026-08-14T04:30:00Z'); // 22:30 on 13 August in Mexico City

afterEach(() => {
  vi.useRealTimers();
});

describe('productTodayStr (#334)', () => {
  it('returns the Mexico City day, not the UTC one, on an evening instant', () => {
    expect(EVENING.toISOString().split('T')[0]).toBe('2026-08-14'); // what the defect returned
    expect(productTodayStr(EVENING)).toBe('2026-08-13');
  });

  it('agrees with UTC during the Mexican working day', () => {
    expect(productTodayStr(new Date('2026-08-14T15:00:00Z'))).toBe('2026-08-14');
  });

  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(productTodayStr(new Date('2026-01-05T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(productTodayStr(new Date('2026-01-05T18:00:00Z'))).toBe('2026-01-05');
  });

  it('handles the hour ICU may render as 24 (midnight in the zone)', () => {
    // 00:15 on 14 August in Mexico City.
    expect(productTodayStr(new Date('2026-08-14T06:15:00Z'))).toBe('2026-08-14');
  });

  it('defaults to now, and does not read the server clock through UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(EVENING);
    expect(productTodayStr()).toBe('2026-08-13');
  });

  it('resolves the zone through Intl rather than a hardcoded offset', () => {
    // Comments stripped: the prose here *discusses* `-06:00` and six hours, and
    // a scan that reads them is a scan that can only ever fail on its own
    // explanation.
    const code = readFileSync('lib/dates.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).toContain('timeZone: PRODUCT_TIME_ZONE');
    expect(PRODUCT_TIME_ZONE).toBe('America/Mexico_City');
    // A fixed offset re-breaks if the central zone ever reinstates DST.
    expect(code).not.toMatch(/-0?6:00/);
    expect(code).not.toMatch(/6\s*\*\s*60\s*\*\s*60/);
  });
});

describe('productMonthStr and productDayStartInstant (#334)', () => {
  it('reads the month off the product day', () => {
    // 22:30 on 31 August there; UTC says September.
    expect(productMonthStr(new Date('2026-09-01T04:30:00Z'))).toBe('2026-08');
  });

  it('converts a product-zone day back to the instant it begins', () => {
    expect(productDayStartInstant('2026-08-01').toISOString()).toBe('2026-08-01T06:00:00.000Z');
    expect(productDayStartInstant('2026-01-01').toISOString()).toBe('2026-01-01T06:00:00.000Z');
  });

  it('round-trips: the day start reads back as that same day', () => {
    for (const day of ['2026-01-01', '2026-04-05', '2026-08-31', '2026-12-31']) {
      expect(productTodayStr(productDayStartInstant(day))).toBe(day);
    }
  });
});

describe('quote expiry uses the product day (#334)', () => {
  it('is still signable all evening on the day it is valid until', () => {
    vi.useFakeTimers();
    vi.setSystemTime(EVENING); // 22:30 on the 13th in Mexico City

    // The UTC day is already the 14th, which is what used to expire it.
    expect(isQuoteExpired('2026-08-13')).toBe(false);
    expect(quoteSignableState({ status: 'sent', valid_until: '2026-08-13' })).toBe('signable');
  });

  it('expires the next day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T04:30:00Z')); // 22:30 on the 14th there
    expect(isQuoteExpired('2026-08-13')).toBe(true);
    expect(quoteSignableState({ status: 'sent', valid_until: '2026-08-13' })).toBe('expired');
  });
});

describe("the assistant's due-today and collected-this-month use the product day (#334)", () => {
  it('counts a milestone due on the product day, not the UTC one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(EVENING);

    const result = parseNaturalLanguageQuery('¿cuáles pagos vencen hoy?', {
      clients: [{ id: 'c1', name: 'Ferretería López' }],
      receivables: [
        { id: 'm1', clientId: 'c1', amount: 5000, status: 'pending', due_date: '2026-08-13' },
        { id: 'm2', clientId: 'c1', amount: 9000, status: 'pending', due_date: '2026-08-14' },
      ],
    });

    expect(result.intent).toBe('due_today');
    expect(result.answerText).toContain('Ferretería López');
    expect(result.totalOverdue).toBe(5000);
  });

  it('keeps a payment confirmed on the last evening of the month inside that month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T04:00:00Z')); // 22:00 on 31 August there

    const result = parseNaturalLanguageQuery('¿cuánto hemos cobrado este mes?', {
      collected: [
        // 21:00 on 31 August in Mexico City — the same month the question is about.
        { clientId: 'c1', amount: 12000, confirmed_at: '2026-09-01T03:00:00Z' },
      ],
    });

    expect(result.intent).toBe('collected_this_month');
    expect(result.answerText).toContain('12,000');
  });

  it('ignores a confirmation whose timestamp is unparseable rather than counting it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(EVENING);

    const result = parseNaturalLanguageQuery('¿cuánto hemos cobrado?', {
      collected: [{ clientId: 'c1', amount: 12000, confirmed_at: 'no es una fecha' }],
    });

    expect(result.answerText).toContain('todavía no has confirmado');
  });
});

/**
 * The acceptance criterion stated as a scan: no server-side day may still be
 * derived from UTC. Demo fixtures and relative offsets (`Date.now() + 15 días`)
 * are not day computation and are excluded by matching only the bare
 * `new Date()` form.
 */
describe('no server module derives "today" from UTC (#334)', () => {
  const SERVER_DAY_SITES = ['lib/quoteSignability.ts', 'lib/aiAssistant.ts', 'lib/quoteQuota.ts'];

  it('has no bare new Date().toISOString() day left at the three sites', () => {
    for (const file of SERVER_DAY_SITES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/new Date\(\)\.toISOString\(\)\.split/);
      expect(source, file).not.toMatch(/getUTCMonth\(\)/);
    }
  });

  it('routes each of them through the product-day helpers', () => {
    for (const file of SERVER_DAY_SITES) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/from '\.\/dates'/);
    }
  });
});

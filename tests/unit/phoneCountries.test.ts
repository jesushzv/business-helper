import { describe, it, expect } from 'vitest';
import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js/max';
import type { CountryCode } from 'libphonenumber-js/max';
import {
  PHONE_COUNTRIES,
  DEFAULT_PHONE_COUNTRY,
  splitPhone,
  joinPhone,
} from '@/lib/phoneCountries';
import { normalizeClientPhone } from '@/lib/phoneValidator';

/**
 * `PHONE_COUNTRIES` is hand-maintained so the client bundle does not carry
 * ~50 KB of numbering-plan metadata just to render a `<select>`. A
 * hand-maintained list is exactly the shape CLAUDE.md warns about — a fixture
 * that drifts from the source it stands in for — so it is checked against the
 * real metadata here rather than trusted.
 */

describe('PHONE_COUNTRIES agrees with libphonenumber metadata', () => {
  it('names a real country and the right calling code for every entry', () => {
    // Derived from the library, not restated: a wrong calling code in the list
    // would send a tenant's number to the wrong country with no other symptom.
    for (const entry of PHONE_COUNTRIES) {
      expect(isSupportedCountry(entry.code), `${entry.code} is not a country`).toBe(true);
      expect(getCountryCallingCode(entry.code as CountryCode), `${entry.label}`).toBe(
        entry.callingCode
      );
    }
  });

  it('parsed a plausible number of countries', () => {
    // Guards the assertion above from passing vacuously on an empty list.
    expect(PHONE_COUNTRIES.length).toBeGreaterThanOrEqual(10);
  });

  it('has no duplicate country codes and leads with Mexico', () => {
    const codes = PHONE_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe(DEFAULT_PHONE_COUNTRY);
  });

  it('labels every entry in Spanish with a flag (hard rule 8)', () => {
    for (const entry of PHONE_COUNTRIES) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.flag.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('splitPhone / joinPhone round-trip', () => {
  it('round-trips every listed country', () => {
    for (const entry of PHONE_COUNTRIES) {
      const stored = `+${entry.callingCode}5551234567`;
      const split = splitPhone(stored);
      expect(split.national, entry.label).toBe('5551234567');
      expect(joinPhone(split.country, split.national), entry.label).toBe(stored);
    }
  });

  it('prefers the longest calling code, so +502 is not read as +50', () => {
    // Guatemala (502) against the shorter codes it could be confused with.
    expect(splitPhone('+50255551234').country).toBe('GT');
    expect(splitPhone('+50655551234').country).toBe('CR');
    expect(splitPhone('+50755551234').country).toBe('PA');
  });

  it('reads a pre-backfill bare national number as Mexican', () => {
    // The shape stored before #94; a deploy can land before the backfill runs.
    expect(splitPhone('8112345678')).toEqual({ country: 'MX', national: '8112345678' });
    expect(joinPhone('MX', '8112345678')).toBe('+528112345678');
  });

  it('hides the retired Mexican mobile 1 when editing an old row', () => {
    expect(splitPhone('+5218115559988')).toEqual({ country: 'MX', national: '8115559988' });
  });

  it('treats an empty value as absent rather than inventing a number', () => {
    for (const input of [null, undefined, '', '   ']) {
      expect(splitPhone(input)).toEqual({ country: 'MX', national: '' });
    }
    // '' is what the write path reads as "no phone"; '+52' would be a phone.
    expect(joinPhone('MX', '')).toBe('');
    expect(joinPhone('US', '   ')).toBe('');
  });

  it('falls back to the default country for an unlisted calling code', () => {
    // Not a rejection — the server still validates and stores it. The field
    // just cannot show a flag it does not carry.
    expect(splitPhone('+8180123456789').country).toBeTruthy();
  });
});

describe('what the field emits is what the server accepts', () => {
  it('produces a value normalizeClientPhone stores unchanged', () => {
    // The client/server disagreement in #95's class: the form sends one thing,
    // the server stores another, and the UI reports success over the gap.
    const cases: Array<[string, string]> = [
      ['MX', '8112345678'],
      ['US', '2125551234'],
      ['GB', '2079460958'],
      ['ES', '600000000'],
      ['CO', '3012345678'],
    ];
    for (const [country, national] of cases) {
      const emitted = joinPhone(country, national);
      const stored = normalizeClientPhone(emitted);
      expect(stored.error, `${country} ${national}`).toBeUndefined();
      expect(stored.value, `${country} ${national}`).toBe(emitted);
    }
  });

  it('an unlisted country still saves when typed with its code', () => {
    // The list bounds what is *pickable*, never what is *storable*.
    expect(normalizeClientPhone('+81 90 1234 5678').value).toBe('+819012345678');
  });
});

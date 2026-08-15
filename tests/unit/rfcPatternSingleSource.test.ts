import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RFC_MORAL_PATTERN, RFC_FISICA_PATTERN, validateRFC } from '@/lib/rfcValidator';
import { RFC_PATTERN } from '@/lib/facturapi';

/**
 * One RFC rule, two enforcement points, one definition (#322 item 1).
 *
 * `lib/rfcValidator.ts` gates *entry* — the client form — and `lib/facturapi.ts`
 * gates *stamping*. Both were live and independently written: `regexMoral` +
 * `regexFisica` on one side, `/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i` on the other.
 * Nothing tied them together and nothing would have failed if they drifted, so
 * the first symptom would have been a client saved successfully and then
 * refused at stamp time — or accepted at stamp time having been refused at
 * entry, which is worse, because it commits the organization's RFC to a
 * document.
 *
 * `RFC_PATTERN` is now built from the validator's two parts. This asserts the
 * union relationship holds over a corpus rather than asserting the regex source
 * text, so an equivalent respelling is fine and a behavioural change is not.
 */

const MORAL = ['ABC120315HD9', 'XAX010101000', 'A&B120315HD9', 'ÑOÑ990101AB1'];
const FISICA = ['GORM850101789', 'MASJ800101XY1', 'PEÑA850101QQ2'];
const REJECTED = [
  '',
  'AB120315HD9', // two letters
  'ABCDE120315HD9', // five letters
  'ABC12031HD9', // five digits
  'ABC120315HD', // two-character homoclave
  'ABC120315HD90', // four-character homoclave
  'ABC-120315-HD9', // punctuation
  'ABC 120315 HD9',
];

describe('RFC_PATTERN is derived from the entry validator (#322)', () => {
  it('is exactly the union of the two shapes, over every case', () => {
    for (const rfc of [...MORAL, ...FISICA, ...REJECTED]) {
      const union = RFC_MORAL_PATTERN.test(rfc) || RFC_FISICA_PATTERN.test(rfc);
      expect(RFC_PATTERN.test(rfc), `${JSON.stringify(rfc)} disagrees between the two gates`).toBe(
        union
      );
    }
  });

  it('accepts at stamp time everything the entry validator accepts', () => {
    for (const rfc of [...MORAL, ...FISICA]) {
      expect(validateRFC(rfc).isValid, rfc).toBe(true);
      expect(RFC_PATTERN.test(rfc), `${rfc} passes entry but not the stamp gate`).toBe(true);
    }
  });

  it('rejects at stamp time everything the entry validator rejects', () => {
    for (const rfc of REJECTED) {
      expect(validateRFC(rfc).isValid, rfc).toBe(false);
      expect(
        RFC_PATTERN.test(rfc.toUpperCase()),
        `${JSON.stringify(rfc)} is refused at entry but would reach a PAC`
      ).toBe(false);
    }
  });

  it('trims in the validator and at the stamp call site, not in the pattern', () => {
    // The one asymmetry the two gates genuinely have, pinned rather than
    // smoothed over: `validateRFC` trims before testing, `RFC_PATTERN` anchors
    // both ends and does not. It agrees because `validateCFDIMetadata` trims at
    // the call site. A future caller passing an untrimmed value straight to the
    // pattern gets a refusal the form would have accepted — which is the right
    // way round, and this says so out loud.
    expect(validateRFC('  ABC120315HD9  ').isValid).toBe(true);
    expect(RFC_PATTERN.test('  ABC120315HD9  ')).toBe(false);
    expect(RFC_PATTERN.test('  ABC120315HD9  '.trim())).toBe(true);
  });

  it('keeps the stamp gate case-insensitive, since it reads what was stored', () => {
    // `validateRFC` upper-cases first; this side does not, so the flag carries
    // that difference. Losing it would refuse every lower-cased stored RFC.
    expect(RFC_PATTERN.flags).toContain('i');
    expect(RFC_PATTERN.test('abc120315hd9')).toBe(true);
    expect(validateRFC('abc120315hd9').isValid).toBe(true);
  });

  it('leaves no second definition of the pattern in facturapi.ts', () => {
    // An assertion of absence, shown to fail before it was committed: restoring
    // the literal `{3,4}` regex turns this red.
    const source = readFileSync(join(process.cwd(), 'lib', 'facturapi.ts'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/\{\s*3\s*,\s*4\s*\}/);
    expect(code).toContain('RFC_MORAL_PATTERN');
    expect(code).toContain('RFC_FISICA_PATTERN');
  });
});

import { describe, it, expect } from 'vitest';
import {
  normalizeIntegerInput,
  normalizeNumericInput,
  numericInputValue,
  parseNumericInput,
} from '@/lib/numericInput';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #151 — what a money field holds while someone is typing into it.
 *
 * The helpers moved here from `lib/lineItemDraft.ts` when four more surfaces
 * needed them; `lineItemDraft` re-exports them, so the wizard's own tests keep
 * covering the line-item path and these cover the rule itself.
 */

describe('normalizeNumericInput', () => {
  it('keeps a half-typed decimal intact, keystroke by keystroke', () => {
    // `1500.` is where `type="number"` blanks the field and a numeric model
    // erases the point: each of these must survive as typed.
    const keystrokes = ['1', '15', '150', '1500', '1500.', '1500.5', '1500.50'];
    let held = '';
    for (const typed of keystrokes) {
      held = normalizeNumericInput(typed);
      expect(held).toBe(typed);
    }
    expect(parseNumericInput(held)).toBe(1500.5);
  });

  it('collapses a leading zero so it cannot multiply the amount', () => {
    expect(normalizeNumericInput('0150')).toBe('150');
    expect(normalizeNumericInput('007')).toBe('7');
    expect(normalizeNumericInput('000')).toBe('0');
    expect(parseNumericInput('0150')).toBe(150);
  });

  it('cleans a pasted MXN amount instead of rejecting it', () => {
    expect(normalizeNumericInput('$1,500.50')).toBe('1500.50');
    expect(parseNumericInput('$1,500.50')).toBe(1500.5);
  });

  it('keeps only the first decimal point', () => {
    expect(normalizeNumericInput('1.5.7')).toBe('1.57');
  });

  it('reads a bare decimal as zero-point-something', () => {
    expect(normalizeNumericInput('.5')).toBe('0.5');
    expect(parseNumericInput('.5')).toBe(0.5);
  });

  it('leaves an emptied field empty rather than snapping it to 0', () => {
    expect(normalizeNumericInput('')).toBe('');
    expect(normalizeNumericInput('   ')).toBe('');
    expect(normalizeNumericInput('abc')).toBe('');
  });
});

describe('normalizeIntegerInput (existencias)', () => {
  it('takes digits only — a count has no decimal', () => {
    expect(normalizeIntegerInput('12.5')).toBe('125');
    expect(normalizeIntegerInput('0150')).toBe('150');
    expect(normalizeIntegerInput('-4')).toBe('4');
  });

  it('keeps empty distinct from zero', () => {
    // Nullable on purpose: "no lo llevo en inventario" is not "tengo cero".
    expect(normalizeIntegerInput('')).toBe('');
    expect(normalizeIntegerInput('0')).toBe('0');
  });
});

describe('numericInputValue', () => {
  it('renders an unset amount as empty, not as 0', () => {
    expect(numericInputValue(null)).toBe('');
    expect(numericInputValue(undefined)).toBe('');
    expect(numericInputValue('')).toBe('');
  });

  it('renders a stored amount as its own text', () => {
    expect(numericInputValue(24500)).toBe('24500');
    expect(numericInputValue(0)).toBe('0');
    expect(numericInputValue(1500.5)).toBe('1500.5');
  });
});

/**
 * The rule as a scanning gate: `type="number"` is not used anywhere in the app's
 * markup. Derived from the tree rather than a hand-kept list of sites, because
 * #151's own list was one site short (the client credit limit) — a fixture
 * cannot catch the drift it names (hard rule #7).
 */
describe('no rendered input binds type="number" (#151)', () => {
  function tsxFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
      else if (entry.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const files = [...tsxFilesUnder('components'), ...tsxFilesUnder('app')];

  it('parsed a plausible number of components', () => {
    // A scan over an empty file list passes vacuously and proves nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds no type="number" outside a comment', () => {
    const offenders = files.filter((file) => {
      const code = readFileSync(file, 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /type="number"/.test(code);
    });

    expect(offenders).toEqual([]);
  });
});

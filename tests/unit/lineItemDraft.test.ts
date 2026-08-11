import { describe, it, expect } from 'vitest';
import {
  ADDED_ITEM_SAT_CODE,
  DEFAULT_SAT_CODE,
  createLineItemDraft,
  normalizeNumericInput,
  parseNumericInput,
  toLineItems,
  validateLineItemDrafts,
  type LineItemDraft,
} from '@/lib/lineItemDraft';

/**
 * The reported experience: "Precio Unitario ($) has a trailing 0 when putting
 * the price which persists".
 *
 * The field was bound to the numeric LineItem, whose untouched value is 0, so
 * the input rendered a literal "0". Typing to the left of it — where a tap on
 * the left half of a 44px field lands — produced 150 → "1500", and
 * `Number(e.target.value)` wrote that back as the price of the concepto.
 */

const draft = (over: Partial<LineItemDraft> = {}): LineItemDraft => ({
  ...createLineItemDraft(),
  description: 'Cemento gris 50kg',
  quantity: '2',
  unit_price: '150',
  ...over,
});

describe('a new concepto prefills no price at all', () => {
  it('leaves unit_price empty so there is no zero to type around', () => {
    expect(createLineItemDraft().unit_price).toBe('');
  });

  it('starts at one unit, and carries the SAT clave it was given', () => {
    expect(createLineItemDraft().quantity).toBe('1');
    expect(createLineItemDraft(DEFAULT_SAT_CODE).sat_code).toBe('30111500');
    expect(createLineItemDraft().sat_code).toBe(ADDED_ITEM_SAT_CODE);
  });
});

describe('normalizeNumericInput', () => {
  it('drops a redundant leading zero — the reported defect, at the source', () => {
    // What the caret-before-the-prefill produces once the digits are typed.
    expect(normalizeNumericInput('0150')).toBe('150');
    expect(normalizeNumericInput('00')).toBe('0');
    expect(normalizeNumericInput('007.5')).toBe('7.5');
  });

  it('keeps a zero that means zero', () => {
    expect(normalizeNumericInput('0')).toBe('0');
    expect(normalizeNumericInput('0.99')).toBe('0.99');
  });

  it('keeps a half-typed decimal instead of eating the keystroke', () => {
    expect(normalizeNumericInput('150.')).toBe('150.');
    expect(normalizeNumericInput('150.0')).toBe('150.0');
    expect(normalizeNumericInput('.5')).toBe('0.5');
  });

  it('treats the comma as the thousands separator it is in es-MX', () => {
    expect(normalizeNumericInput('1,500')).toBe('1500');
  });

  it('refuses letters, signs and a second separator', () => {
    expect(normalizeNumericInput('$1,500.50 MXN')).toBe('1500.50');
    expect(normalizeNumericInput('-40')).toBe('40');
    expect(normalizeNumericInput('1.5.7')).toBe('1.57');
    expect(normalizeNumericInput('abc')).toBe('');
  });

  it('leaves an empty field empty', () => {
    expect(normalizeNumericInput('')).toBe('');
  });
});

describe('parseNumericInput', () => {
  it('reads blank and half-typed values as zero, never NaN', () => {
    expect(parseNumericInput('')).toBe(0);
    expect(parseNumericInput('.')).toBe(0);
    expect(parseNumericInput('abc')).toBe(0);
  });

  it('reads the typed amount, leading zeros included', () => {
    expect(parseNumericInput('0150')).toBe(150);
    expect(parseNumericInput('1500.50')).toBe(1500.5);
  });
});

describe('toLineItems', () => {
  it('produces the numeric LineItem the calculator and the API expect', () => {
    expect(toLineItems([draft({ description: '  Cemento  ', quantity: '3', unit_price: '0150' })])).toEqual([
      {
        description: 'Cemento',
        quantity: 3,
        unit_price: 150,
        sat_code: ADDED_ITEM_SAT_CODE,
        unit: 'E48',
      },
    ]);
  });

  it('sends zero for an untouched price rather than inventing one', () => {
    const [item] = toLineItems([draft({ unit_price: '' })]);
    expect(item.unit_price).toBe(0);
  });
});

describe('validateLineItemDrafts names the concepto that is incomplete', () => {
  it('passes a complete set', () => {
    expect(validateLineItemDrafts([draft(), draft()])).toEqual({ valid: true, message: null });
  });

  it('asks for the description first, by number', () => {
    const result = validateLineItemDrafts([draft(), draft({ description: '   ' })]);
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Escribe la descripción del concepto #2.');
  });

  it('asks for a quantity above zero', () => {
    expect(validateLineItemDrafts([draft({ quantity: '0' })]).message).toBe(
      'La cantidad del concepto #1 debe ser mayor a cero.'
    );
  });

  it('asks for the price of the untouched concepto', () => {
    const result = validateLineItemDrafts([draft(), draft({ unit_price: '' })]);
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Escribe el precio unitario del concepto #2.');
  });

  it('speaks Spanish, without developer jargon', () => {
    const message = validateLineItemDrafts([draft({ unit_price: '' })]).message ?? '';
    expect(message).toMatch(/precio unitario/i);
    expect(message).not.toMatch(/unit_price|null|undefined|NaN/);
  });
});

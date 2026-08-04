import { describe, it, expect } from 'vitest';
import { searchFAQItems, generateWhatsAppSupportLink, FAQ_ITEMS, CATEGORIES } from '@/lib/helpFAQ';

describe('Help Center & FAQ Engine Suite', () => {
  it('should list default categories including cotizaciones, cobranza, facturacion', () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(4);
    const ids = CATEGORIES.map((c) => c.id);
    expect(ids).toContain('todas');
    expect(ids).toContain('cotizaciones');
    expect(ids).toContain('cobranza');
    expect(ids).toContain('facturacion');
  });

  it('should filter FAQ items by text query across questions, answers, and tags', () => {
    const results = searchFAQItems('SPEI');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((item) => {
      const match =
        item.question.toLowerCase().includes('spei') ||
        item.answer.toLowerCase().includes('spei') ||
        item.tags.some((t) => t.toLowerCase().includes('spei'));
      expect(match).toBe(true);
    });
  });

  it('should filter FAQ items by category pill', () => {
    const results = searchFAQItems('', 'cotizaciones');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((item) => {
      expect(item.category).toBe('cotizaciones');
    });
  });

  it('should generate valid WhatsApp support link with encoded message', () => {
    const link = generateWhatsAppSupportLink('problema con facturación');
    expect(link).toContain('https://wa.me/528180000000?text=');
    expect(link).toContain(encodeURIComponent('problema con facturación'));
  });
});

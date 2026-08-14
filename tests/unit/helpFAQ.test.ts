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

  /**
   * #296 — the support line is configuration, not a literal.
   *
   * This test used to pin `wa.me/528180000000` — 81 8000 0000, a
   * placeholder-shaped number nobody verified answers — holding the
   * fabricated live-transfer promise in place (hard rule #7). The number now
   * comes from NEXT_PUBLIC_SUPPORT_WHATSAPP; unset, no link is produced and
   * no chat button renders.
   */
  it('builds the support link from the configured line, with the message encoded', () => {
    const link = generateWhatsAppSupportLink('problema con facturación', {
      NEXT_PUBLIC_SUPPORT_WHATSAPP: '5218112345678',
    });
    expect(link).toContain('https://wa.me/5218112345678?text=');
    expect(link).toContain(encodeURIComponent('problema con facturación'));
  });

  it('produces no link at all when no support line is configured', () => {
    expect(generateWhatsAppSupportLink('ayuda', {})).toBe('');
    // Junk shapes are not a phone number either.
    expect(generateWhatsAppSupportLink('ayuda', { NEXT_PUBLIC_SUPPORT_WHATSAPP: '12345' })).toBe('');
  });

  it('never falls back to the retired placeholder number', () => {
    expect(generateWhatsAppSupportLink('ayuda', {})).not.toContain('528180000000');
  });
});

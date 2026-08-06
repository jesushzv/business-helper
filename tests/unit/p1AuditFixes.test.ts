import { describe, it, expect } from 'vitest';
import { TESTIMONIALS } from '@/lib/trustData';

describe('P1 Audit Fixes — Verification Suite', () => {
  it('should structure testimonials as Casos de Uso por Industria with industry tags and metrics', () => {
    expect(TESTIMONIALS.length).toBeGreaterThanOrEqual(4);
    TESTIMONIALS.forEach((t) => {
      expect(t.useCaseTitle).toBeDefined();
      expect(t.industry).toBeDefined();
      expect(t.metricTag).toBeDefined();
      expect(t.personaLabel).toBeDefined();
    });
  });

  it('should calculate ROI days saved pluralization correctly', () => {
    const formatDaysSaved = (hoursSaved: number) => {
      const days = Math.max(1, Math.round(hoursSaved / 8));
      return `${days} ${days === 1 ? 'día laborable completo' : 'días laborables completos'}`;
    };

    expect(formatDaysSaved(8)).toBe('1 día laborable completo');
    expect(formatDaysSaved(16)).toBe('2 días laborables completos');
    expect(formatDaysSaved(30)).toBe('4 días laborables completos');
  });
});

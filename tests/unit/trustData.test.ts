import { describe, it, expect } from 'vitest';
import {
  TESTIMONIALS,
  TRUST_BADGES,
  TEAM_MEMBERS,
  CONTACT_INFO,
  DEMO_WALKTHROUGH_STEPS,
  getSupportEmail,
  getFounderEmail,
  getTechSupportEmail,
} from '@/lib/trustData';

describe('WS-A Credibility, Social Proof & Trust Architecture Data Engine', () => {
  it('should export realistic Mexican SME testimonials with roles, locations and metric tags', () => {
    expect(TESTIMONIALS.length).toBeGreaterThanOrEqual(2);
    TESTIMONIALS.forEach((t) => {
      expect(t.quote).toBeDefined();
      expect(t.location).toBeDefined();
      expect(t.metricTag).toBeDefined();
      expect(t.rating).toBe(5);
    });
  });

  // The standalone 'pac-partner' badge was removed in 1e39e7c ("simplify trust
  // badges"), alongside 1a9b532 ("trust badge accuracy"). Do not restore it:
  // there is no PAC integration (see the CFDI issue), so the badge asserted a
  // partnership the product does not have.
  it('should feature SAT CFDI, SSL 256-bit, and Banxico SPEI seals in trust badges', () => {
    const badgeIds = TRUST_BADGES.map((b) => b.id);
    expect(badgeIds).toContain('sat-cfdi');
    expect(badgeIds).toContain('ssl-encryption');
    expect(badgeIds).toContain('banxico-spei');
    expect(badgeIds).not.toContain('pac-partner');

    const satBadge = TRUST_BADGES.find((b) => b.id === 'sat-cfdi');
    expect(satBadge?.description).toContain('Nunca almacenamos tus certificados SAT');
  });

  it('should include founder profiles for Hector Zamora, Gilberto Santana, and Guillermo Fernandez', () => {
    expect(TEAM_MEMBERS.length).toBe(3);
    const names = TEAM_MEMBERS.map((m) => m.name);
    expect(names).toContain('Hector Zamora');
    expect(names).toContain('Gilberto Santana');
    expect(names).toContain('Guillermo Fernandez');
  });

  it('should resolve configurable email helpers correctly', () => {
    expect(getSupportEmail()).toBeDefined();
    expect(getFounderEmail()).toBeDefined();
    expect(getTechSupportEmail()).toBeDefined();
  });

  it('should define Tijuana / San Diego location and valid contact channels in CONTACT_INFO', () => {
    expect(CONTACT_INFO.cityState).toContain('Tijuana');
    expect(CONTACT_INFO.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(CONTACT_INFO.supportEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(CONTACT_INFO.founderEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('should structure demo video walkthrough steps matching the full quote-to-payment CUJ flow', () => {
    expect(DEMO_WALKTHROUGH_STEPS.length).toBe(4);
    expect(DEMO_WALKTHROUGH_STEPS[0].screenMockupType).toBe('quote');
    expect(DEMO_WALKTHROUGH_STEPS[1].screenMockupType).toBe('whatsapp');
    expect(DEMO_WALKTHROUGH_STEPS[2].screenMockupType).toBe('otp');
    expect(DEMO_WALKTHROUGH_STEPS[3].screenMockupType).toBe('spei');
  });
});

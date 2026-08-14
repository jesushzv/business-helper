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
    // Casos de Uso por Industria: four industries minimum, each fully tagged
    // (folded in from the retired p1AuditFixes suite).
    expect(TESTIMONIALS.length).toBeGreaterThanOrEqual(4);
    TESTIMONIALS.forEach((t) => {
      expect(t.quote).toBeDefined();
      expect(t.location).toBeDefined();
      expect(t.metricTag).toBeDefined();
      expect(t.useCaseTitle).toBeDefined();
      expect(t.industry).toBeDefined();
      expect(t.personaLabel).toBeDefined();
      expect(t.rating).toBe(5);
    });
  });

  it('phrases the SSL badge as a benefit, never a protocol version (#103)', () => {
    const sslBadge = TRUST_BADGES.find((b) => b.id === 'ssl-encryption');
    expect(sslBadge).toBeDefined();
    // "TLS 1.3" is an implementation detail to the person reading a trust
    // badge. The Stripe PCI credential is a recognisable seal and stays.
    expect(sslBadge?.externalSealLabel).not.toContain('TLS');
    expect(sslBadge?.externalSealLabel).toContain('cifrada');
    expect(sslBadge?.externalSealLabel).toContain('PCI DSS Nivel 1');
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

  it('names only the real founder — a solo-founder project invents no teammates (#230)', () => {
    expect(TEAM_MEMBERS.length).toBe(1);
    const names = TEAM_MEMBERS.map((m) => m.name);
    expect(names).toContain('Hector Zamora');
  });

  it('should resolve configurable email helpers correctly', () => {
    expect(getSupportEmail()).toBeDefined();
    expect(getFounderEmail()).toBeDefined();
    expect(getTechSupportEmail()).toBeDefined();
  });

  it('should define Tijuana / San Diego location and valid contact channels in CONTACT_INFO', () => {
    // Exact pins folded in from the retired p0AuditFixes suite: the legal
    // address and every official inbox on the businesshelper.app domain
    // (.mx was never registered, #36).
    expect(CONTACT_INFO.cityState).toBe('Tijuana, B.C., México / San Diego, CA');
    expect(CONTACT_INFO.country).toBe('México / EE.UU.');
    expect(CONTACT_INFO.email).toBe('contacto@businesshelper.app');
    expect(CONTACT_INFO.supportEmail).toBe('soporte@businesshelper.app');
    expect(CONTACT_INFO.privacyEmail).toBe('privacidad@businesshelper.app');
    expect(CONTACT_INFO.founderEmail).toBe('hector@businesshelper.app');
  });

  it('should structure demo video walkthrough steps matching the full quote-to-payment CUJ flow', () => {
    expect(DEMO_WALKTHROUGH_STEPS.length).toBe(4);
    expect(DEMO_WALKTHROUGH_STEPS[0].screenMockupType).toBe('quote');
    expect(DEMO_WALKTHROUGH_STEPS[1].screenMockupType).toBe('whatsapp');
    expect(DEMO_WALKTHROUGH_STEPS[2].screenMockupType).toBe('otp');
    expect(DEMO_WALKTHROUGH_STEPS[3].screenMockupType).toBe('spei');
  });
});

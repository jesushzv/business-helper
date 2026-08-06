import { describe, it, expect } from 'vitest';
import { TRUST_BADGES, TEAM_MEMBERS } from '@/lib/trustData';

describe('P2 Audit Fixes — Verification Suite', () => {
  it('should phrase SSL and Stripe security accurately in trust badges', () => {
    const sslBadge = TRUST_BADGES.find((b) => b.id === 'ssl-encryption');
    expect(sslBadge).toBeDefined();
    expect(sslBadge?.externalSealLabel).toContain('TLS 1.3');
    expect(sslBadge?.externalSealLabel).toContain('Stripe (PCI DSS Nivel 1)');
  });

  it('should include founder profiles with valid direct email contacts and clear bios', () => {
    expect(TEAM_MEMBERS.length).toBe(3);
    TEAM_MEMBERS.forEach((member) => {
      expect(member.name).toBeDefined();
      expect(member.bio).toBeDefined();
      expect(member.contactEmail).toContain('@businesshelper.app');
    });
  });
});

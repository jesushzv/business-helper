import { describe, it, expect } from 'vitest';
import { TRUST_BADGES, TEAM_MEMBERS } from '@/lib/trustData';

describe('P2 Audit Fixes — Verification Suite', () => {
  it('should phrase SSL and Stripe security accurately in trust badges', () => {
    const sslBadge = TRUST_BADGES.find((b) => b.id === 'ssl-encryption');
    expect(sslBadge).toBeDefined();
    // #103 removed the protocol version — "TLS 1.3" is an implementation
    // detail to the person reading a trust badge. The Stripe credential is a
    // recognisable seal and stays.
    expect(sslBadge?.externalSealLabel).not.toContain('TLS');
    expect(sslBadge?.externalSealLabel).toContain('cifrada');
    expect(sslBadge?.externalSealLabel).toContain('PCI DSS Nivel 1');
  });

  it('should include the founder profile with a valid direct email contact and clear bio', () => {
    // Solo-founder project (#230): exactly one real profile, never invented teammates.
    expect(TEAM_MEMBERS.length).toBe(1);
    TEAM_MEMBERS.forEach((member) => {
      expect(member.name).toBeDefined();
      expect(member.bio).toBeDefined();
      expect(member.contactEmail).toContain('@businesshelper.app');
    });
  });
});

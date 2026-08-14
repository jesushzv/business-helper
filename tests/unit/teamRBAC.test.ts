import { describe, it, expect } from 'vitest';
import { hasCapability, validateInviteInput } from '@/lib/teamRBAC';

describe('Multi-User Team Roles & RBAC Engine', () => {
  it('grants billing management to the owner only', () => {
    expect(hasCapability('owner', 'billing_management')).toBe(true);
    expect(hasCapability('manager', 'billing_management')).toBe(false);
    expect(hasCapability('member', 'billing_management')).toBe(false);
    expect(hasCapability('accountant', 'billing_management')).toBe(false);
  });

  it('lets managers invite members but not plain members', () => {
    expect(hasCapability('manager', 'invite_members')).toBe(true);
    expect(hasCapability('member', 'invite_members')).toBe(false);
  });

  it('scopes the accountant to money confirmation, not quote authoring', () => {
    expect(hasCapability('accountant', 'confirm_payment')).toBe(true);
    expect(hasCapability('accountant', 'issue_cfdi')).toBe(true);
    expect(hasCapability('accountant', 'create_quote')).toBe(false);
  });

  it('denies every capability to an unknown or empty role', () => {
    expect(hasCapability('', 'create_quote')).toBe(false);
    expect(hasCapability('superadmin', 'create_quote')).toBe(false);
  });

  it('rejects an invitation with a malformed address or unknown role', () => {
    expect(validateInviteInput('not-an-email', 'member').isValid).toBe(false);
    expect(validateInviteInput('socio@negocio.mx', 'superadmin').isValid).toBe(false);
    expect(validateInviteInput('socio@negocio.mx', 'member').isValid).toBe(true);
  });

  it('requires an address shape, not just an @ — "%@%" used to pass and ride into a wildcard match (#289)', () => {
    // The old check was includes('@'): every string below passed it.
    expect(validateInviteInput('%@%', 'member').isValid).toBe(false);
    expect(validateInviteInput('@', 'member').isValid).toBe(false);
    expect(validateInviteInput('a@b', 'member').isValid).toBe(false);
    expect(validateInviteInput('socio nuevo@negocio.mx', 'member').isValid).toBe(false);
    // Real addresses keep working — including LIKE-wildcard characters, which
    // the .eq revocation match renders inert rather than this gate rejecting.
    expect(validateInviteInput('jose_luis+obras@negocio.com.mx', 'member').isValid).toBe(true);
    expect(validateInviteInput('  Socio@Negocio.mx  ', 'member').isValid).toBe(true);
  });
});

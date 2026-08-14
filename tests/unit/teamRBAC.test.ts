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

  it('reserves record deletion for owner and manager', () => {
    // Deletes were the only writes with no gate: a member could destroy a
    // client while confirming a payment required manager rank.
    expect(hasCapability('owner', 'delete_records')).toBe(true);
    expect(hasCapability('manager', 'delete_records')).toBe(true);
    expect(hasCapability('member', 'delete_records')).toBe(false);
    expect(hasCapability('accountant', 'delete_records')).toBe(false);
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
});

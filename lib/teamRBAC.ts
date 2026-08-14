/**
 * Multi-User Team Roles & RBAC Engine — Business Helper
 * 
 * Enforces role hierarchy (owner, manager, member, accountant) and permissions matrix.
 */

export type UserRole = 'owner' | 'manager' | 'member' | 'accountant';

export type Capability =
  | 'create_quote'
  | 'edit_quote'
  | 'confirm_payment'
  | 'request_payment'
  | 'invite_members'
  | 'billing_management'
  | 'issue_cfdi'
  | 'view_analytics'
  /**
   * Setting a client's trade-credit line: `credit_limit`, `credit_days`,
   * `credit_status` (#123).
   *
   * Its own capability rather than `billing_management`, which is owner-only
   * and about *this org's* Stripe subscription — a different decision from how
   * much credit the business extends to a customer, and one a manager running
   * the commercial side should be able to make. Members keep full client CRUD
   * without it: a member may register and edit a client, not decide the terms
   * on which it is trusted with money.
   */
  | 'manage_credit';

const ROLE_CAPABILITIES: Record<UserRole, Set<Capability>> = {
  owner: new Set([
    'create_quote',
    'edit_quote',
    'confirm_payment',
    'request_payment',
    'invite_members',
    'billing_management',
    'issue_cfdi',
    'view_analytics',
    'manage_credit'
  ]),
  manager: new Set([
    'create_quote',
    'edit_quote',
    'confirm_payment',
    'request_payment',
    'invite_members',
    'issue_cfdi',
    'view_analytics',
    'manage_credit'
  ]),
  member: new Set([
    'create_quote',
    'edit_quote',
    'request_payment'
  ]),
  accountant: new Set([
    'confirm_payment',
    'issue_cfdi',
    'view_analytics'
  ])
};

export function hasCapability(role: UserRole | string, capability: Capability): boolean {
  if (!role || typeof role !== 'string') return false;
  const roleKey = role.toLowerCase() as UserRole;
  const capabilities = ROLE_CAPABILITIES[roleKey];
  if (!capabilities) return false;
  return capabilities.has(capability);
}

/**
 * An address shape, not just "contains @": `%@%` passed the old check and rode
 * into an unescaped `ilike` that revoked every pending invitation in the
 * organization (#289). One local part, one domain with a dot, no whitespace.
 * The revocation itself now matches with `.eq`, so LIKE wildcards in a real
 * address (`_` is common) stay inert rather than being rejected here.
 */
const INVITE_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInviteInput(email: string, role: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string' || !INVITE_EMAIL_SHAPE.test(email.trim())) {
    return { isValid: false, error: 'Correo electrónico inválido' };
  }

  const validRoles: UserRole[] = ['owner', 'manager', 'member', 'accountant'];
  if (!role || !validRoles.includes(role.toLowerCase() as UserRole)) {
    return { isValid: false, error: 'Rol de usuario inválido (debe ser manager, member o accountant)' };
  }

  return { isValid: true };
}

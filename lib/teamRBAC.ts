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
  | 'view_analytics';

const ROLE_CAPABILITIES: Record<UserRole, Set<Capability>> = {
  owner: new Set([
    'create_quote',
    'edit_quote',
    'confirm_payment',
    'request_payment',
    'invite_members',
    'billing_management',
    'issue_cfdi',
    'view_analytics'
  ]),
  manager: new Set([
    'create_quote',
    'edit_quote',
    'confirm_payment',
    'request_payment',
    'invite_members',
    'issue_cfdi',
    'view_analytics'
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

export function validateInviteInput(email: string, role: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { isValid: false, error: 'Correo electrónico inválido' };
  }

  const validRoles: UserRole[] = ['owner', 'manager', 'member', 'accountant'];
  if (!role || !validRoles.includes(role.toLowerCase() as UserRole)) {
    return { isValid: false, error: 'Rol de usuario inválido (debe ser manager, member o accountant)' };
  }

  return { isValid: true };
}

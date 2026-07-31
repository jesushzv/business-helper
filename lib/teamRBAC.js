/**
 * Multi-User Team Roles & RBAC Engine — CommonJS JS
 */

const ROLE_CAPABILITIES = {
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

function hasCapability(role, capability) {
  if (!role || typeof role !== 'string') return false;
  const roleKey = role.toLowerCase();
  const capabilities = ROLE_CAPABILITIES[roleKey];
  if (!capabilities) return false;
  return capabilities.has(capability);
}

function validateInviteInput(email, role) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return { isValid: false, error: 'Correo electrónico inválido' };
  }

  const validRoles = ['owner', 'manager', 'member', 'accountant'];
  if (!role || !validRoles.includes(String(role).toLowerCase())) {
    return { isValid: false, error: 'Rol de usuario inválido' };
  }

  return { isValid: true };
}

module.exports = {
  hasCapability,
  validateInviteInput
};

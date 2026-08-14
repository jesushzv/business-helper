/**
 * Team invitation tokens.
 *
 * `POST /api/organization/members` used to return `{ success: true, member: {…} }`
 * built from the request body, with nothing written and no mail sent. An
 * invitation is now a row in `organization_invitations` plus a single-use link:
 * the raw token goes to the invitee, only its SHA-256 digest is stored, and
 * redeeming it inserts the `organization_members` row.
 *
 * The token is compared by digest, the same treatment the OTP codes get — a
 * dump of the invitations table must not yield working links.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getAppBaseUrl } from './url';
import type { UserRole } from './teamRBAC';

/** Roles an invitation may grant. Ownership is not transferable by invite. */
const INVITABLE_ROLES: readonly UserRole[] = ['manager', 'member', 'accountant'] as const;

const INVITATION_TTL_DAYS = 7;

export interface InvitationToken {
  /** Sent to the invitee; never stored. */
  token: string;
  /** Stored in `organization_invitations.token_hash`. */
  tokenHash: string;
}

export function generateInvitationToken(): InvitationToken {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison, so a wrong token cannot be narrowed by timing. */
export function invitationTokenMatches(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(hashInvitationToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function invitationExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function buildInvitationUrl(token: string, baseUrl: string = getAppBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}/invitacion/${token}`;
}

/** Emails are matched case-insensitively; the invitee may type either casing. */
export function normalizeInviteEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function isInvitableRole(role: string): role is UserRole {
  return INVITABLE_ROLES.includes((role || '').toLowerCase() as UserRole);
}

export type InvitationRejection =
  | 'NOT_FOUND'
  | 'ALREADY_ACCEPTED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'EMAIL_MISMATCH';

export interface InvitationRecord {
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  email: string;
}

/**
 * Decides whether an invitation may be redeemed by this account.
 *
 * Returns a rejection reason rather than a boolean so the route can answer
 * "esta invitación ya fue usada" instead of a flat 404, and so the email
 * binding is enforced in one place: a link forwarded to a third party must not
 * let that party into the organization.
 */
export function evaluateInvitation(
  invitation: InvitationRecord | null | undefined,
  accountEmail: string,
  now: Date = new Date()
): { ok: true } | { ok: false; reason: InvitationRejection } {
  if (!invitation) return { ok: false, reason: 'NOT_FOUND' };
  if (invitation.status === 'accepted') return { ok: false, reason: 'ALREADY_ACCEPTED' };
  if (invitation.status === 'revoked') return { ok: false, reason: 'REVOKED' };
  if (new Date(invitation.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (normalizeInviteEmail(invitation.email) !== normalizeInviteEmail(accountEmail)) {
    return { ok: false, reason: 'EMAIL_MISMATCH' };
  }
  return { ok: true };
}

export const INVITATION_REJECTION_MESSAGES: Record<InvitationRejection, string> = {
  NOT_FOUND: 'Esta invitación no existe o el enlace es incorrecto',
  ALREADY_ACCEPTED: 'Esta invitación ya fue utilizada',
  REVOKED: 'Esta invitación fue cancelada',
  EXPIRED: 'Esta invitación expiró. Pide una nueva a tu equipo',
  EMAIL_MISMATCH: 'Esta invitación fue enviada a otro correo electrónico',
};

/**
 * What to tell someone whose acceptance will not change what they see (#269).
 *
 * The membership is real — this is not a failure — but the app resolves one
 * organization per account (owner first, then the oldest membership) and has no
 * switcher, so an external accountant invited by a second client, or anyone who
 * registered their own business before accepting, lands on the *other*
 * company's dashboard. Saying "Abriendo tu panel…" and showing them that is the
 * moment the product lies to them.
 *
 * Plain Spanish, no jargon about tenancy or resolution order, and it ends with
 * the one thing they can actually do today. Both names are optional because a
 * name we could not read must not become a placeholder standing in for a real
 * business (#44/#78): the copy degrades to "otra empresa" instead.
 */
export function buildUnchangedOrganizationNotice(
  joinedName: string | null,
  activeName: string | null
): string {
  const joined = joinedName ? `«${joinedName}»` : 'esta empresa';
  const active = activeName ? `«${activeName}»` : 'otra empresa que ya tenías';

  return (
    `Ya quedaste registrado en el equipo de ${joined}. ` +
    `Por ahora tu cuenta sigue abriendo ${active}: Business Helper muestra una empresa a la vez. ` +
    `Para trabajar en ${joined} desde esta app, pide que te inviten con otro correo y entra con esa cuenta.`
  );
}

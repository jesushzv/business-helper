import { NextResponse } from 'next/server';
import { hasCapability, validateInviteInput, UserRole } from '@/lib/teamRBAC';
import { requireOrgAccess } from '@/lib/apiAuth';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  buildInvitationUrl,
  generateInvitationToken,
  invitationExpiry,
  isInvitableRole,
  normalizeInviteEmail,
} from '@/lib/teamInvitations';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { apiError } from '@/lib/apiError';

/**
 * Team members and invitations.
 *
 * GET used to return two hardcoded people ("Don Roberto", "Lic. Mariana") for
 * every tenant, and POST returned a fabricated member object without writing a
 * row or sending anything. Both now operate on the database: GET reads the
 * organization's real membership and pending invitations, POST records an
 * invitation and returns the single-use link that redeems it.
 */

interface MemberResponseItem {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  role: UserRole;
  invitedAt: string;
  isCurrentUser: boolean;
}

/**
 * Resolves member emails from `auth.users`, which is not reachable from the
 * request-scoped client. Without a service role the membership is still real —
 * the addresses are simply unavailable, and are reported as null rather than
 * invented.
 */
async function resolveEmails(userIds: string[]): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  for (const id of userIds) emails.set(id, null);

  if (!isServiceRoleConfigured() || userIds.length === 0) return emails;

  try {
    const service = createServiceClient();
    const results = await Promise.all(
      userIds.map(async (id) => {
        const { data } = await service.auth.admin.getUserById(id);
        return [id, data?.user?.email ?? null] as const;
      })
    );
    for (const [id, email] of results) emails.set(id, email);
  } catch (error) {
    console.error('[members] could not resolve member emails:', error);
  }

  return emails;
}

function displayName(email: string | null, userId: string): string {
  if (email) return email.split('@')[0];
  return `Usuario ${userId.slice(0, 8)}`;
}

export async function GET() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId } = auth.ctx;

  try {
    const [{ data: memberRows, error }, { data: organization }, { data: invitationRows }] =
      await Promise.all([
        supabase
          .from('organization_members')
          .select('id, user_id, role, invited_at')
          .eq('organization_id', organizationId)
          .order('invited_at', { ascending: true }),
        supabase
          .from('organizations')
          .select('owner_id, created_at')
          .eq('id', organizationId)
          .maybeSingle(),
        supabase
          .from('organization_invitations')
          .select('id, email, role, status, expires_at, created_at')
          .eq('organization_id', organizationId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

    if (error) {
      return apiError(500, 'SERVER_ERROR', 'Error al cargar el equipo');
    }

    const rows = memberRows || [];
    const ownerId = organization?.owner_id as string | undefined;

    // The owner is a member of the organization whether or not a membership row
    // was ever written for them, so it is synthesized rather than omitted.
    const ownerMissing = Boolean(ownerId) && !rows.some((r: { user_id: string }) => r.user_id === ownerId);

    const userIds = [...rows.map((r: { user_id: string }) => r.user_id)];
    if (ownerMissing && ownerId) userIds.push(ownerId);

    const emails = await resolveEmails(userIds);

    const members: MemberResponseItem[] = rows.map(
      (row: { id: string; user_id: string; role: UserRole; invited_at: string }) => {
        const email = emails.get(row.user_id) ?? null;
        return {
          id: row.id,
          user_id: row.user_id,
          name: displayName(email, row.user_id),
          email,
          role: row.user_id === ownerId ? 'owner' : row.role,
          invitedAt: row.invited_at,
          isCurrentUser: row.user_id === userId,
        };
      }
    );

    if (ownerMissing && ownerId) {
      const email = emails.get(ownerId) ?? null;
      members.unshift({
        id: `owner-${ownerId}`,
        user_id: ownerId,
        name: displayName(email, ownerId),
        email,
        role: 'owner',
        invitedAt: (organization?.created_at as string) || new Date().toISOString(),
        isCurrentUser: ownerId === userId,
      });
    }

    const invitations = (invitationRows || []).map(
      (row: { id: string; email: string; role: UserRole; status: string; expires_at: string; created_at: string }) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })
    );

    return NextResponse.json({ members, invitations });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al cargar el equipo');
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role: callerRole } = auth.ctx;

  if (!hasCapability(callerRole, 'invite_members')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite invitar colaboradores');
  }

  try {
    const body = await request.json();
    const { email, role } = body;

    const validation = validateInviteInput(email, role);
    if (!validation.isValid) {
      // Fallback because `error` is optional on the validator's result: an
      // invalid-with-no-reason would otherwise serve an envelope with no
      // message at all, which the typed helper now refuses to build.
      return apiError(400, 'INVALID_INPUT', validation.error || 'Los datos de la invitación no son válidos.');
    }

    // validateInviteInput accepts 'owner'; an invitation cannot grant it.
    if (!isInvitableRole(role)) {
      return apiError(400, 'INVALID_ROLE', 'El rol debe ser gerente, miembro o contador');
    }

    const normalizedEmail = normalizeInviteEmail(email);
    const invitedRole = role.toLowerCase() as UserRole;

    // Re-inviting the same address replaces the previous pending link rather
    // than leaving two redeemable tokens outstanding. `.eq`, never `ilike`:
    // `%`/`_` are LIKE wildcards, and one stray `%` in the typed address used
    // to revoke every pending invitation in the organization (#289). Rows are
    // stored normalized, so equality on the normalized address is the
    // case-insensitive match the ilike was there for.
    const { error: revokeError } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .eq('email', normalizedEmail);

    if (revokeError) {
      // Proceeding on a failed revoke used to collide the INSERT with the
      // still-pending row (23505 via uq_org_invitation_pending_email) — a
      // confusing "no se pudo crear" whose real cause was never named, and
      // without that index it would have left two redeemable links (#314).
      return dbWriteErrorResponse(revokeError, 'la invitación anterior', 'POST /api/organization/members', {
        verb: 'reemplazar',
      });
    }

    const { token, tokenHash } = generateInvitationToken();

    const { data: invitation, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: organizationId,
        email: normalizedEmail,
        role: invitedRole,
        token_hash: tokenHash,
        invited_by: userId,
        expires_at: invitationExpiry(),
      })
      .select('id, email, role, status, expires_at, created_at')
      .single();

    if (error || !invitation) {
      return dbWriteErrorResponse(error, 'la invitación', 'POST /api/organization/members', {
        verb: 'crear',
      });
    }

    const inviteUrl = buildInvitationUrl(token);

    // There is no mail provider configured in this deployment, so the link is
    // returned for the inviter to send over WhatsApp or email themselves.
    // `emailSent` reports what actually happened; it is never asserted.
    return NextResponse.json(
      {
        success: true,
        emailSent: false,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expires_at,
          createdAt: invitation.created_at,
        },
        inviteUrl,
      },
      { status: 201 }
    );
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al invitar miembro');
  }
}

/** Changes an existing member's role. The team UI's role dropdown posts here. */
export async function PATCH(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role: callerRole } = auth.ctx;

  if (!hasCapability(callerRole, 'invite_members')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite cambiar permisos');
  }

  try {
    const body = await request.json();
    const memberId = typeof body?.memberId === 'string' ? body.memberId : null;
    const nextRole = typeof body?.role === 'string' ? body.role.toLowerCase() : null;

    if (!memberId || !nextRole || !isInvitableRole(nextRole)) {
      return apiError(400, 'INVALID_INPUT', 'Miembro o rol no válido');
    }

    const { data: organization } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', organizationId)
      .maybeSingle();

    const { data: member } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .eq('id', memberId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!member) {
      return apiError(404, 'NOT_FOUND', 'Miembro no encontrado');
    }

    // Demoting the owner would leave the organization with no billing or
    // invite authority, and the owner is not a role an invite can restore.
    if (organization?.owner_id && member.user_id === organization.owner_id) {
      return apiError(403, 'FORBIDDEN', 'No se puede cambiar el rol del dueño');
    }

    const { error } = await supabase
      .from('organization_members')
      .update({ role: nextRole })
      .eq('id', memberId)
      .eq('organization_id', organizationId);

    if (error) {
      return dbWriteErrorResponse(error, 'el rol del integrante', 'PATCH /api/organization/members', {
        verb: 'actualizar',
      });
    }

    return NextResponse.json({ success: true, memberId, role: nextRole });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al actualizar el rol');
  }
}

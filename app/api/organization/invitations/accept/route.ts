import { NextResponse } from 'next/server';
import { requireUser, resolveActiveOrganization } from '@/lib/apiAuth';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  buildUnchangedOrganizationNotice,
  evaluateInvitation,
  hashInvitationToken,
  INVITATION_REJECTION_MESSAGES,
} from '@/lib/teamInvitations';
import { apiError } from '@/lib/apiError';

/**
 * Redeems a team invitation.
 *
 * The invitee is not a member of the organization yet, so no RLS policy can
 * match their invitation row — this route uses the service-role client and, per
 * the rule that client carries, filters on the exact secret token supplied by
 * the caller. It never widens the query beyond the single hashed token.
 *
 * The signed-in account's email must match the address the invitation was sent
 * to, so forwarding the link does not hand a stranger a seat.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isServiceRoleConfigured()) {
    return apiError(503, 'BACKEND_NOT_CONFIGURED', 'Las invitaciones no están disponibles en esta instalación');
  }

  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return apiError(400, 'INVALID_INPUT', 'Enlace de invitación incompleto');
    }

    const { data: { user } } = await auth.supabase.auth.getUser();
    const accountEmail = user?.email || '';

    // Cast for the same reason the webhook route does: the generated Database
    // types do not carry PostgREST's builder generics, so the typed client
    // narrows inserts to `never`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = createServiceClient() as any;

    const { data: invitation } = await service
      .from('organization_invitations')
      .select('id, organization_id, email, role, status, expires_at')
      .eq('token_hash', hashInvitationToken(token))
      .maybeSingle();

    const evaluation = evaluateInvitation(invitation, accountEmail);

    if (!evaluation.ok) {
      const status = evaluation.reason === 'NOT_FOUND' ? 404 : 409;
      return apiError(status, evaluation.reason, INVITATION_REJECTION_MESSAGES[evaluation.reason]);
    }

    // Narrowed by evaluateInvitation, which rejects a null invitation.
    const accepted = invitation!;

    const { error: memberError } = await service.from('organization_members').insert({
      organization_id: accepted.organization_id,
      user_id: auth.userId,
      role: accepted.role,
    });

    // 23505 = the caller is already in this organization; the invitation is
    // still consumed below so the link stops working either way.
    if (memberError && memberError.code !== '23505') {
      return apiError(500, 'SERVER_ERROR', 'No se pudo unir a la organización');
    }

    const { error: consumeError } = await service
      .from('organization_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: auth.userId,
      })
      .eq('id', accepted.id)
      .eq('status', 'pending');

    if (consumeError) {
      console.error('[invitations] membership created but invitation not consumed:', consumeError);
    }

    // Does joining actually change what this account opens? (#269)
    //
    // The membership is real and the invitation is spent — that part succeeded
    // and is reported as success. But `resolveActiveOrganization` is what every
    // authenticated route uses to pick the caller's tenant, and it answers
    // owner-first, then the oldest membership. For the external accountant
    // invited by a second client, or anyone who registered their own business
    // before accepting, the answer stays the *other* organization, and the app
    // has no switcher to change it. "Ya formas parte del equipo. Abriendo tu
    // panel…" followed by the first client's data is the honesty rule failing
    // on the one screen where the user could still be told.
    const active = await resolveActiveOrganization(service, auth.userId);

    let activeOrganizationName: string | null = null;
    if (active && active.organizationId !== accepted.organization_id) {
      const { data: activeOrg } = await service
        .from('organizations')
        .select('name')
        .eq('id', active.organizationId)
        .maybeSingle();
      // A name we could not read is left null; the copy below has a form that
      // does not need it, rather than a placeholder standing in for a business.
      activeOrganizationName = typeof activeOrg?.name === 'string' ? activeOrg.name : null;
    }

    const { data: joinedOrg } = await service
      .from('organizations')
      .select('name')
      .eq('id', accepted.organization_id)
      .maybeSingle();
    const joinedName = typeof joinedOrg?.name === 'string' ? joinedOrg.name : null;

    const showsOtherOrganization = Boolean(
      active && active.organizationId !== accepted.organization_id
    );

    return NextResponse.json({
      success: true,
      organizationId: accepted.organization_id,
      organizationName: joinedName,
      role: accepted.role,
      /**
       * Present only when the acceptance changes nothing on screen. Spanish and
       * safe to render verbatim, like the public-route envelopes: the page shows
       * it instead of the "abriendo tu panel" countdown, and branches on `code`.
       */
      notice: showsOtherOrganization
        ? {
            code: 'ACTIVE_ORGANIZATION_UNCHANGED',
            message: buildUnchangedOrganizationNotice(joinedName, activeOrganizationName),
          }
        : null,
      activeOrganizationId: showsOtherOrganization ? active?.organizationId ?? null : null,
    });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al aceptar la invitación');
  }
}

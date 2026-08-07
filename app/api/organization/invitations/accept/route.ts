import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiAuth';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  evaluateInvitation,
  hashInvitationToken,
  INVITATION_REJECTION_MESSAGES,
} from '@/lib/teamInvitations';

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
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'Las invitaciones no están disponibles en esta instalación',
        },
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Enlace de invitación incompleto' } },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          error: {
            code: evaluation.reason,
            message: INVITATION_REJECTION_MESSAGES[evaluation.reason],
          },
        },
        { status }
      );
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
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo unir a la organización' } },
        { status: 500 }
      );
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

    return NextResponse.json({
      success: true,
      organizationId: accepted.organization_id,
      role: accepted.role,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al aceptar la invitación' } },
      { status: 500 }
    );
  }
}

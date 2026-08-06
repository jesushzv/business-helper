import { NextResponse } from 'next/server';
import { validateInviteInput } from '@/lib/teamRBAC';
import { requireOrgAccess } from '@/lib/apiAuth';

/**
 * Team members.
 *
 * NOTE: both handlers are still mocked — GET returns two hardcoded people and
 * POST returns a fabricated invite without writing anything or sending mail.
 * Auth is enforced here so the endpoints are not anonymous, but the invite flow
 * does not work and must not be shipped as though it does.
 */
export async function GET() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;

  const members = [
    { id: 'mem-1', user_id: 'user-owner', name: 'Don Roberto', email: 'roberto@distribuidoradelnorte.com.mx', role: 'owner' },
    { id: 'mem-2', user_id: 'user-manager', name: 'Lic. Mariana', email: 'mariana@distribuidoradelnorte.com.mx', role: 'manager' }
  ];
  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { email, role } = body;

    const validation = validateInviteInput(email, role);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: validation.error } },
        { status: 400 }
      );
    }

    // Flagged as simulated so a caller cannot mistake this for a sent invite.
    return NextResponse.json(
      {
        success: true,
        simulated: true,
        member: {
          id: `mem-${Date.now()}`,
          email,
          role,
          invitedAt: new Date().toISOString()
        }
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al invitar miembro' } },
      { status: 500 }
    );
  }
}

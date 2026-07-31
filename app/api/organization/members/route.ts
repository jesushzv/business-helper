import { NextResponse } from 'next/server';
import { validateInviteInput } from '@/lib/teamRBAC';

export async function GET() {
  const members = [
    { id: 'mem-1', user_id: 'user-owner', name: 'Don Roberto', email: 'roberto@distribuidoradelnorte.com.mx', role: 'owner' },
    { id: 'mem-2', user_id: 'user-manager', name: 'Lic. Mariana', email: 'mariana@distribuidoradelnorte.com.mx', role: 'manager' }
  ];
  return NextResponse.json({ members });
}

export async function POST(request: Request) {
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

    return NextResponse.json(
      {
        success: true,
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

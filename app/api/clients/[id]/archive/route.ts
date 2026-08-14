import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

/**
 * Archives a client, or restores one (#337).
 *
 * `quotes.client_id` and `contracts.client_id` are ON DELETE RESTRICT, so any
 * client who has ever been quoted is permanently undeletable — the normal case
 * for every client that matters. #262 made that refusal honest and visible;
 * this is where the tenant goes after reading it.
 *
 * **Archiving is directory visibility, not a soft delete.** The client's
 * quotes, contracts and milestones are untouched and keep working: an archived
 * client's `/q/` and `/pay/` links still resolve, their cobros still appear in
 * Cobranza, and their history still reaches the accountant export. What
 * changes is that they stop appearing in the directory and in the quote
 * wizard's picker — the two places where the tenant is choosing *who to work
 * with next*.
 *
 * Its own route rather than a field on `PUT /api/clients/[id]`: `archived_at`
 * is a timestamp the server owns, and putting it in `CLIENT_WRITABLE_FIELDS`
 * would let a caller write any value into it. Here the only input is a
 * boolean, and `now()` comes from the server.
 *
 * Gated on `delete_records`, the same capability as deletion — this is offered
 * from the same dialog, and it is the same decision about whether someone may
 * remove a record from the working set. A member registers and edits clients;
 * taking one out of the directory is for whoever runs the business.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'delete_records')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Tu rol no permite archivar clientes',
        },
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    // The verb is explicit. Defaulting an absent/garbled body to "archive"
    // would let a malformed restore hide a client instead.
    if (typeof body?.archived !== 'boolean') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message: 'Indica si el cliente se archiva o se restaura.',
          },
        },
        { status: 400 }
      );
    }

    const { data: updated, error } = await supabase
      .from('clients')
      .update({ archived_at: body.archived ? new Date().toISOString() : null })
      // Scoped by organization as well as id, so a by-id write cannot reach
      // another tenant's row and 404s instead of revealing it exists.
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el cliente', 'POST /api/clients/[id]/archive', {
        verb: body.archived ? 'archivar' : 'restaurar',
      });
    }

    if (!updated) {
      // Zero rows changed looks exactly like success (#128).
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
        { status: 404 }
      );
    }

    // The server row, so the caller applies what was stored rather than what
    // it asked for.
    return NextResponse.json({ client: updated });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al archivar el cliente' } },
      { status: 500 }
    );
  }
}

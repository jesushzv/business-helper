import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, MILESTONE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

/**
 * Single-milestone operations.
 *
 * All three handlers were unauthenticated and looked the milestone up by id
 * alone. PUT passed the raw body to `.update()` and DELETE ignored its result;
 * both returned `{success: true}` when the write failed or matched no rows.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;

    const { data: milestone, error } = await supabase
      .from('milestones')
      .select('*, contracts(*, clients(*))')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !milestone) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } }, { status: 404 });
    }

    return NextResponse.json(milestone);
  } catch {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'No se pudo cargar el cobro.' } }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  try {
    const { id } = await params;
    const body = await request.json();
    const updates = pickFields(body, MILESTONE_WRITABLE_FIELDS);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_WRITABLE_FIELDS', message: 'No hay campos válidos para actualizar' } },
        { status: 400 }
      );
    }

    // `status` is a writable field, so without this check a role denied at
    // /confirm could mark the milestone collected here instead — same financial
    // outcome, minus the audit log and the complemento the confirm route files.
    if (updates.status === 'confirmed' && !hasCapability(role, 'confirm_payment')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Tu rol no permite confirmar pagos' } },
        { status: 403 }
      );
    }

    const { data: updated, error } = await supabase
      .from('milestones')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el cobro', 'PUT /api/receivables/[id]', {
        verb: 'actualizar',
      });
    }

    if (!updated) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'No se pudieron guardar los cambios del cobro.' } }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'delete_records')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite eliminar cobros' } },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    // A stamp claim means an invoice run is (or was) in flight for this
    // milestone: between the claim insert and the cfdi_status flip the row
    // still reads pending/none, and deleting it would CASCADE the claim away
    // (cfdi_stamp_claims.milestone_id) — leaving a possible live SAT document
    // with no milestone and no reconciliation anchor. The remaining
    // insert-after-this-read race is the FK decision in #328; whether a
    // signed contract's schedule may be edited at all is #329.
    const { data: stampClaim } = await supabase
      .from('cfdi_stamp_claims')
      .select('milestone_id')
      .eq('milestone_id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (stampClaim) {
      return NextResponse.json(
        {
          error: {
            code: 'MILESTONE_PROTECTED',
            message:
              'Este cobro tiene una factura en proceso de timbrado, ' +
              'así que no se puede eliminar.',
          },
        },
        { status: 409 }
      );
    }

    // Only a milestone nothing has happened to yet may be deleted. Once the
    // payment loop starts (`requested`/`marked_paid`/`confirmed`) or a CFDI
    // exists for it, the row is a money/fiscal record — and deleting it would
    // CASCADE its complementos de pago (payment_complements.milestone_id).
    // The precondition rides inside the DELETE so a payment declared between
    // check and destruction still blocks it.
    const { data: deleted, error } = await supabase
      .from('milestones')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .eq('cfdi_status', 'none')
      .select('id')
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el cobro', 'DELETE /api/receivables/[id]', {
        verb: 'eliminar',
      });
    }

    if (!deleted) {
      const { data: existing } = await supabase
        .from('milestones')
        .select('id')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          {
            error: {
              code: 'MILESTONE_PROTECTED',
              message:
                'Este cobro ya tiene movimientos de pago o factura registrados, ' +
                'así que forma parte de tu historial y no se puede eliminar.',
            },
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo eliminar el cobro' } },
      { status: 500 }
    );
  }
}

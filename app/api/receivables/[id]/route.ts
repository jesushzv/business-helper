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

/**
 * Contract states whose payment schedule is still the tenant's to change.
 *
 * An allowlist, not a denylist of signed states: `completed` and `cancelled`
 * are excluded too, and a status this vocabulary has not heard of refuses
 * rather than falls through — the #95 rule about mapping an unrecognised value
 * to the nearest listed one instead of to nothing.
 */
const DELETABLE_CONTRACT_STATUSES = new Set(['draft', 'sent']);

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

    // An `amount` edit on a stamped cobro used to be accepted and then change
    // nothing (#352). Since #341 the stamped `cfdi_total` is the base for what
    // the cobro must be paid to settle, so an owner could edit a stamped
    // milestone from $10,000 to $15,000, see the save succeed, and watch
    // Cobranza go on showing $10,000 — a screen ignoring what they just typed,
    // with no explanation, which is the #146 shape.
    //
    // Option A from #352: refuse, and name the invoice. The CFDI is the fiscal
    // fact; changing what the client owes means cancelling it and re-stamping,
    // which is what the SAT expects anyway. Only `issued` is blocked — a
    // cancelled or failed document governs nothing, and the field stays usable
    // for typo fixes on everything unstamped.
    if (updates.amount !== undefined) {
      const { data: stamped } = await supabase
        .from('milestones')
        .select('cfdi_status, cfdi_uuid')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (stamped?.cfdi_status === 'issued') {
        return NextResponse.json(
          {
            error: {
              code: 'AMOUNT_LOCKED_BY_CFDI',
              message:
                'Este cobro ya tiene una factura timbrada' +
                (stamped.cfdi_uuid ? ` (folio fiscal ${stamped.cfdi_uuid})` : '') +
                ', así que el monto quedó en firme. Para cobrar otra cantidad, ' +
                'cancela la factura y emite una nueva.',
              fields: { amount: 'El monto no se puede cambiar con una factura timbrada.' },
            },
          },
          { status: 409 }
        );
      }
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

    // Whether a signed contract's schedule may be edited at all was #329; the
    // answer taken there is **no** (#335). A schedule carrying the client's
    // OTP evidence is immutable, exactly as #327 treats signed quotes:
    // deleting a pending milestone of a `client_signed`/`accepted` contract
    // makes sum(milestones) ≠ contracts.total_amount and silently changes what
    // the payer sees on a /pay/[token] link that may already be in their hands.
    //
    // Read separately rather than inside the DELETE's filter chain, because
    // PostgREST cannot filter a DELETE on an embedded resource — the milestone
    // preconditions ride in the statement below precisely because they *can*.
    // Residual race: a signature landing between this read and the DELETE is
    // not caught here. It is bounded — the contract must be `draft`/`sent`
    // right now, and the client's signature is seconds of wall clock away from
    // an owner's delete tap — and closing it properly wants the invariant at
    // the database layer (#336's restrictive FOR DELETE policies), not a
    // second app-level read.
    const { data: parent } = await supabase
      .from('milestones')
      .select('id, contracts(status)')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!parent) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    // `contract_id` is NOT NULL, so an unresolvable contract is a broken row,
    // not a permissive one — and "we could not establish the status" must not
    // collapse into "go ahead and destroy it" (#64's tri-state rule, applied
    // to a destructive write).
    const contract = Array.isArray(parent.contracts) ? parent.contracts[0] : parent.contracts;
    const contractStatus = (contract as { status?: string } | null)?.status;

    if (!contractStatus || !DELETABLE_CONTRACT_STATUSES.has(contractStatus)) {
      return NextResponse.json(
        {
          error: {
            code: 'CONTRACT_SIGNED',
            message:
              'Tu cliente ya firmó el contrato de este cobro, así que el plan de pagos ' +
              'quedó en firme y no se puede eliminar. Si el plan cambió, haz una ' +
              'cotización nueva.',
          },
        },
        { status: 409 }
      );
    }

    // A stamp claim means an invoice run is (or was) in flight for this
    // milestone: between the claim insert and the cfdi_status flip the row
    // still reads pending/none, and deleting it would CASCADE the claim away
    // (cfdi_stamp_claims.milestone_id) — leaving a possible live SAT document
    // with no milestone and no reconciliation anchor. The remaining
    // insert-after-this-read race is the FK decision in #328.
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

    // A declared payment is the record that money moved, and
    // `milestone_payments.milestone_id` is `ON DELETE RESTRICT` (#381) — so
    // without this pre-check the DELETE below fails with a bare `23503` and
    // the tenant is told the cobro "tiene registros relacionados", naming
    // nothing they could act on. Same treatment the stamp claim gets above:
    // refuse in words that say which record is in the way.
    //
    // Reachable in practice: a `pending` milestone carrying a
    // `transferred_amount` is a partial wire the owner logged and left open,
    // which is exactly what the backfill turned into a ledger row.
    const { data: declaredPayment } = await supabase
      .from('milestone_payments')
      .select('id')
      .eq('milestone_id', id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();

    if (declaredPayment) {
      return NextResponse.json(
        {
          error: {
            code: 'MILESTONE_PROTECTED',
            message:
              'Este cobro ya tiene un pago registrado, así que no se puede eliminar. ' +
              'Si el pago fue un error, corrígelo con tu contador antes de borrar el cobro.',
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

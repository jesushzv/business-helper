import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, MILESTONE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { apiError } from '@/lib/apiError';

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
      return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
    }

    return NextResponse.json(milestone);
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudo cargar el cobro.');
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

    // `status` is a writable field, so without this check a role denied at
    // /confirm could mark the milestone collected here instead — same financial
    // outcome, minus the audit log and the complemento the confirm route files.
    //
    // **First**, ahead of the field-shape checks below: a caller who may not do
    // this at all is refused for that reason, not handed a 400 about the shape
    // of a request they were never allowed to make. Putting the #394 check
    // above this reordered exactly that, and `receivablesRBAC.test.ts` caught
    // it — a `member` sending both fields got "regístralo como un pago"
    // instead of "tu rol no permite confirmar pagos".
    if (updates.status === 'confirmed' && !hasCapability(role, 'confirm_payment')) {
      return apiError(403, 'FORBIDDEN', 'Tu rol no permite confirmar pagos');
    }

    // `transferred_amount` left MILESTONE_WRITABLE_FIELDS in #394, so it would
    // otherwise be dropped here in silence — the caller gets a 200 for a money
    // write that never happened, which is the shape #95 shipped. Checked
    // against the raw body (`pickFields` has already discarded it) and before
    // the empty-body check, so a request carrying only this field says why
    // rather than "no hay campos válidos".
    if (body?.transferred_amount !== undefined) {
      return apiError(
        400,
        'AMOUNT_NOT_WRITABLE_HERE',
        'El monto recibido ya no se edita directamente: regístralo como un pago para que quede ' +
          'el detalle de cuándo y cómo llegó. Usa "Registrar pago" en el cobro.',
        { fields: { transferred_amount: 'Regístralo como un pago, no como un total.' } }
      );
    }

    if (Object.keys(updates).length === 0) {
      return apiError(400, 'NO_WRITABLE_FIELDS', 'No hay campos válidos para actualizar');
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
        return apiError(409, 'AMOUNT_LOCKED_BY_CFDI', 'Este cobro ya tiene una factura timbrada' +
                (stamped.cfdi_uuid ? ` (folio fiscal ${stamped.cfdi_uuid})` : '') +
                ', así que el monto quedó en firme. Para cobrar otra cantidad, ' +
                'cancela la factura y emite una nueva.', { fields: { amount: 'El monto no se puede cambiar con una factura timbrada.' } });
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
      return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
    }

    return NextResponse.json(updated);
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudieron guardar los cambios del cobro.');
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
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite eliminar cobros');
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
      return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
    }

    // `contract_id` is NOT NULL, so an unresolvable contract is a broken row,
    // not a permissive one — and "we could not establish the status" must not
    // collapse into "go ahead and destroy it" (#64's tri-state rule, applied
    // to a destructive write).
    const contract = Array.isArray(parent.contracts) ? parent.contracts[0] : parent.contracts;
    const contractStatus = (contract as { status?: string } | null)?.status;

    if (!contractStatus || !DELETABLE_CONTRACT_STATUSES.has(contractStatus)) {
      return apiError(409, 'CONTRACT_SIGNED', 'Tu cliente ya firmó el contrato de este cobro, así que el plan de pagos ' +
              'quedó en firme y no se puede eliminar. Si el plan cambió, haz una ' +
              'cotización nueva.');
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
      return apiError(409, 'MILESTONE_PROTECTED', 'Este cobro tiene una factura en proceso de timbrado, ' +
              'así que no se puede eliminar.');
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
      return apiError(
        409,
        'MILESTONE_PROTECTED',
        'Este cobro ya tiene un pago registrado, así que no se puede eliminar. ' +
          'Si el pago fue un error, corrígelo con tu contador antes de borrar el cobro.'
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
        return apiError(409, 'MILESTONE_PROTECTED', 'Este cobro ya tiene movimientos de pago o factura registrados, ' +
                'así que forma parte de tu historial y no se puede eliminar.');
      }

      return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudo eliminar el cobro');
  }
}

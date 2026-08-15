import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { resolvePacCredentials } from '@/lib/pacConnection';
import { CFDI_CANCELLATION_MOTIVES, cancelInvoice } from '@/lib/pacClient';
import { apiError } from '@/lib/apiError';

/**
 * Cancels one complemento de pago at the SAT (#30).
 *
 * A complement is a separate stamped document with its own folio fiscal and
 * its own PAC invoice id. `/api/invoices/[id]/cancel` cancels the *invoice*;
 * nothing could cancel a complement, so a milestone whose complement was
 * stamped in error — wrong amount, wrong payment date, a payment that turned
 * out to have bounced — was stuck twice over: the complement was wrong and
 * could not be withdrawn, and the SAT will not accept the cancellation of a
 * PPD invoice while a complement referencing it is still live, so the invoice
 * could not be cancelled either.
 *
 * ## What cancelling one does to the balance
 *
 * Nothing here recomputes anything. `planPaymentComplement` counts only rows
 * with `status === 'issued'`, so a cancelled complement frees its amount again
 * by virtue of no longer being issued — the balance is derived, never stored.
 *
 * **The parcialidad is not freed with it.** The next complement takes the next
 * number, never the cancelled one's: `installment` is `issued.length + 1`, and
 * the partial unique index on `(milestone_id, installment) WHERE status <>
 * 'failed'` keeps the cancelled row occupying its number, so the database
 * enforces the same rule the calculator follows. That leaves a gap in the
 * sequence, which is the honest record of a cancellation — the alternative is
 * two documents at the SAT sharing one NumParcialidad for one invoice.
 *
 * ## No UI caller, by the same decision as #174
 *
 * Nothing calls this, and for launch nothing should. Cancellation needs a
 * motivo (01–04), `01` additionally needs the replacement document's UUID, the
 * receptor can refuse anything that is not `04`, and the SAT answers
 * asynchronously. `tests/unit/cfdiCancelHasNoUiCaller.test.ts` covers this
 * route too, so a caller appearing reopens the decision out loud.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; complementId: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role } = auth.ctx;

  if (!hasCapability(role, 'issue_cfdi')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite cancelar documentos fiscales');
  }

  if (!isServiceRoleConfigured()) {
    return apiError(503, 'BACKEND_NOT_CONFIGURED', 'La facturación CFDI no está configurada en este entorno.');
  }

  const { id, complementId } = await params;

  let body: { motive?: string; substitutionUuid?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const motive = typeof body?.motive === 'string' ? body.motive : '';
  if (!CFDI_CANCELLATION_MOTIVES[motive]) {
    return apiError(400, 'INVALID_MOTIVE', 'Indica un motivo de cancelación del SAT: 01, 02, 03 o 04.', { extra: { motives: CFDI_CANCELLATION_MOTIVES } });
  }

  // Scoped by its own id *and* the milestone it belongs to *and* the caller's
  // organization — the same triple the document route uses, so a complement id
  // from another cobro cannot be cancelled through this one.
  const { data: complement } = await supabase
    .from('cfdi_payment_complements')
    .select('id, installment, amount, status, cfdi_id, cfdi_uuid, milestone_id')
    .eq('id', complementId)
    .eq('milestone_id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!complement) {
    return apiError(404, 'NOT_FOUND', 'Complemento de pago no encontrado');
  }

  if (complement.status !== 'issued' || !complement.cfdi_id) {
    return apiError(409, 'NOT_ISSUED', complement.status === 'cancelled'
              ? 'Este complemento de pago ya está cancelado.'
              : 'Este complemento de pago no está timbrado, así que no hay nada que cancelar ante el SAT.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const pac = await resolvePacCredentials(service, organizationId);

  if (!pac.ok) {
    return apiError(503, pac.code, pac.message);
  }

  const result = await cancelInvoice(
    pac.credentials,
    complement.cfdi_id,
    motive,
    typeof body?.substitutionUuid === 'string' ? body.substitutionUuid : undefined
  );

  if (!result.ok) {
    return apiError(result.code === 'REJECTED' ? 400 : 502, `PAC_${result.code}`, result.message);
  }

  const { data: updated, error: updateError } = await supabase
    .from('cfdi_payment_complements')
    .update({
      status: 'cancelled',
      cancelled_at: result.data.cancelledAt,
      // The SAT may hold the request pending the recipient's approval. Saying
      // so beats presenting it as settled — the same posture the invoice
      // cancel route takes.
      error:
        result.data.status === 'pending'
          ? 'Cancelación enviada al SAT, pendiente de aceptación por el receptor.'
          : null,
    })
    .eq('id', complementId)
    .eq('organization_id', organizationId)
    // The row count, not just the error: 0 rows changed looks exactly like
    // success (#128), and here that means a document cancelled at the SAT
    // still reading as live in the balance every other screen derives.
    .select('id');

  if (updateError || !updated || updated.length === 0) {
    console.error(
      '[cfdi] complement cancelled but failed to record it:',
      updateError?.message ?? 'update matched no complement row'
    );
    return apiError(500, 'CANCEL_NOT_RECORDED', `La cancelación del complemento con folio ${complement.cfdi_uuid} se envió al SAT, ` +
            'pero no se pudo actualizar el cobro. Anota el folio y contacta a soporte.', { extra: { uuid: complement.cfdi_uuid } });
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    action: 'cfdi.complement_cancelled',
    actor: userId,
    details:
      `Complemento de pago ${complement.cfdi_uuid} (parcialidad ${complement.installment}) ` +
      `cancelado con motivo ${motive} (${CFDI_CANCELLATION_MOTIVES[motive]})`,
  });

  return NextResponse.json({
    uuid: complement.cfdi_uuid,
    installment: complement.installment,
    status: result.data.status,
    cancelledAt: result.data.cancelledAt,
    motive,
    // Stated back so a caller does not have to infer it: the amount is free
    // again, the number is not.
    note:
      'El monto de este complemento vuelve a quedar pendiente. La siguiente parcialidad ' +
      'toma el número siguiente, no el de este complemento cancelado.',
  });
}

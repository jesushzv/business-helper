import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { resolvePacCredentials } from '@/lib/pacConnection';
import { CFDI_CANCELLATION_MOTIVES, cancelInvoice } from '@/lib/pacClient';

/**
 * Cancels a stamped CFDI at the SAT.
 *
 * A CFDI cannot be deleted or edited: the only way back is a cancellation
 * filed with a motive, which the SAT records. Until now the product had no way
 * to do it at all — the simulated stamp had nothing to cancel — so a milestone
 * invoiced by mistake stayed invoiced.
 *
 * The folio is not refunded. The stamp was issued and the PAC charged for it;
 * returning the folio would let a cancel-and-restamp loop mint free ones.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role } = auth.ctx;

  if (!hasCapability(role, 'issue_cfdi')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite cancelar facturas CFDI' } },
      { status: 403 }
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'La facturación CFDI no está configurada en este entorno.',
        },
      },
      { status: 503 }
    );
  }

  const { id } = await params;

  let body: { motive?: string; substitutionUuid?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const motive = typeof body?.motive === 'string' ? body.motive : '';
  if (!CFDI_CANCELLATION_MOTIVES[motive]) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_MOTIVE',
          message: 'Indica un motivo de cancelación del SAT: 01, 02, 03 o 04.',
        },
        motives: CFDI_CANCELLATION_MOTIVES,
      },
      { status: 400 }
    );
  }

  const { data: milestone } = await supabase
    .from('milestones')
    .select('id, label, contract_id, cfdi_id, cfdi_uuid, cfdi_status')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
      { status: 404 }
    );
  }

  if (milestone.cfdi_status !== 'issued' || !milestone.cfdi_id) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_ISSUED',
          message: 'Este cobro no tiene una factura timbrada que cancelar.',
        },
      },
      { status: 409 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;
  const pac = await resolvePacCredentials(service, organizationId);

  if (!pac.ok) {
    return NextResponse.json(
      { error: { code: pac.code, message: pac.message } },
      { status: 503 }
    );
  }

  const result = await cancelInvoice(
    pac.credentials,
    milestone.cfdi_id,
    motive,
    typeof body?.substitutionUuid === 'string' ? body.substitutionUuid : undefined
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: `PAC_${result.code}`, message: result.message } },
      { status: result.code === 'REJECTED' ? 400 : 502 }
    );
  }

  const { error: updateError } = await supabase
    .from('milestones')
    .update({
      cfdi_status: 'cancelled',
      cfdi_cancelled_at: result.data.cancelledAt,
      // The SAT may hold the request pending the recipient's approval; say so
      // rather than presenting it as settled.
      cfdi_error:
        result.data.status === 'pending'
          ? 'Cancelación enviada al SAT, pendiente de aceptación por el receptor.'
          : null,
    })
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (updateError) {
    console.error('[cfdi] cancelled but failed to record milestone:', updateError.message);
    return NextResponse.json(
      {
        error: {
          code: 'CANCEL_NOT_RECORDED',
          message: `La cancelación se envió al SAT para el folio ${milestone.cfdi_uuid}, pero no se pudo actualizar el cobro.`,
        },
      },
      { status: 500 }
    );
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    contract_id: milestone.contract_id,
    action: 'cfdi.cancelled',
    actor: userId,
    details: `CFDI ${milestone.cfdi_uuid} cancelado con motivo ${motive} (${CFDI_CANCELLATION_MOTIVES[motive]})`,
  });

  return NextResponse.json({
    uuid: milestone.cfdi_uuid,
    status: result.data.status,
    cancelledAt: result.data.cancelledAt,
    motive,
  });
}

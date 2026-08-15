import { NextResponse } from 'next/server';
import { readOrganizationTrialState } from '@/lib/organizationTrialGate';
import { TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE } from '@/lib/subscriptionTrial';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { issuePaymentComplement, planPaymentComplement } from '@/lib/complementoPago';
import { getAppBaseUrl } from '@/lib/url';
import { apiError } from '@/lib/apiError';

/**
 * Complementos de pago for one milestone's PPD invoice.
 *
 * `/api/receivables/[id]/confirm` files a complement automatically when a
 * payment is confirmed, which covers the ordinary path. This route exists for
 * the two cases that path cannot serve:
 *
 *   - **Retrying a failure.** The PAC being unreachable does not cancel the
 *     obligation; the complement is still due. A `failed` row is a debt the
 *     user has to be able to settle.
 *   - **A payment the product did not confirm.** A partial transfer, or one
 *     reconciled outside the app. Each payment on a PPD invoice owes its own
 *     complement, and the parcialidad is derived from what is already on
 *     record, so a second call files the second one rather than repeating the
 *     first.
 *
 * GET reports the state: what has been filed, what is outstanding, and whether
 * a complement is owed right now.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  // Same reading as the document route: the roles that may issue a CFDI or see
  // the organization's finances.
  if (!hasCapability(role, 'issue_cfdi') && !hasCapability(role, 'view_analytics')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite consultar documentos fiscales');
  }

  const { id } = await params;

  const { data: milestone } = await supabase
    .from('milestones')
    .select(
      'id, amount, transferred_amount, cfdi_status, cfdi_uuid, cfdi_id, cfdi_total, ' +
        'cfdi_payment_method'
    )
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!milestone) {
    return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
  }

  const { data: complements } = await supabase
    .from('cfdi_payment_complements')
    .select(
      'id, installment, amount, last_balance, remaining_balance, status, cfdi_uuid, ' +
        'cfdi_environment, cfdi_xml_path, cfdi_pdf_path, payment_date, operation_number, error, stamped_at'
    )
    .eq('milestone_id', id)
    .eq('organization_id', organizationId)
    .order('installment', { ascending: true });

  const rows = complements || [];
  const plan = planPaymentComplement(milestone, rows);
  const baseUrl = getAppBaseUrl();

  return NextResponse.json({
    milestoneId: id,
    paymentMethod: milestone.cfdi_payment_method || 'PUE',
    complements: rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      installment: row.installment,
      amount: Number(row.amount),
      lastBalance: Number(row.last_balance),
      remainingBalance: Number(row.remaining_balance),
      status: row.status,
      uuid: row.cfdi_uuid,
      environment: row.cfdi_environment,
      paymentDate: row.payment_date,
      operationNumber: row.operation_number,
      stampedAt: row.stamped_at,
      error: row.error,
      xmlUrl: row.cfdi_xml_path
        ? `${baseUrl}/api/invoices/${id}/document?type=xml&complement=${row.id}`
        : null,
      pdfUrl: row.cfdi_pdf_path
        ? `${baseUrl}/api/invoices/${id}/document?type=pdf&complement=${row.id}`
        : null,
    })),
    // `required` is the answer to "does this cobro owe the SAT a complement
    // right now" — the question the invoicing screen needs to ask.
    outstanding: plan.required
      ? {
          required: true,
          installment: plan.installment,
          amount: plan.amount,
          lastBalance: plan.lastBalance,
        }
      : { required: false, reason: plan.reason, message: plan.message },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role } = auth.ctx;

    // #128 — the trial gate. Extended past quote creation on the founder's
    // decision: the states blocked are "no new quotes, contracts or CFDI", and
    // reminders. Stamping for work already closed was argued the other way in
    // this PR's original scope; the call taken is that issuing a fiscal document
    // is starting something, while *collecting* on one already issued is not —
    // so payment confirmation, uploads and cancellation stay open, and this does
    // not.
    //
    // Permissive on unknown, like the quotes route: readOrganizationTrialState
    // answers "unknown" for any read it could not complete, and unknown never
    // gates.
    const trial = await readOrganizationTrialState(supabase, organizationId);
    if (trial.blocksNewWork) {
      return apiError(402, TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE, { details: { trial_ended_at: trial.endsAt } });
    }


  // Filing a complement by hand is a deliberate act of issuing a stamped
  // document, unlike the automatic one that follows a confirmed payment, so it
  // is held to the same capability as stamping an invoice.
  if (!hasCapability(role, 'issue_cfdi')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite emitir complementos de pago');
  }

  if (!isServiceRoleConfigured()) {
    return apiError(503, 'BACKEND_NOT_CONFIGURED', 'La facturación CFDI no está configurada en este entorno.');
  }

  const { id } = await params;

  let body: {
    amount?: unknown;
    paymentForm?: unknown;
    paymentDate?: unknown;
    operationNumber?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let amount: number | null = null;
  if (body?.amount !== undefined && body?.amount !== null) {
    const parsed = Number(body.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return apiError(400, 'INVALID_INPUT', 'El monto del pago no es válido');
    }
    amount = parsed;
  }

  const outcome = await issuePaymentComplement({
    supabase,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service: createServiceClient() as any,
    organizationId,
    userId,
    milestoneId: id,
    amount,
    paymentForm: typeof body?.paymentForm === 'string' ? body.paymentForm : '03',
    paymentDate: typeof body?.paymentDate === 'string' ? body.paymentDate : null,
    operationNumber: typeof body?.operationNumber === 'string' ? body.operationNumber : null,
    baseUrl: getAppBaseUrl(),
  });

  if (!outcome.ok) {
    return apiError(outcome.status, outcome.code, outcome.message);
  }

  if (!outcome.issued) {
    // Nothing was owed. That is not an error, but the caller asked for a
    // document and is getting none, so the reason has to travel with the 200.
    return NextResponse.json({ issued: false, reason: outcome.reason, message: outcome.message });
  }

  return NextResponse.json({ issued: true, ...outcome.complement });
}

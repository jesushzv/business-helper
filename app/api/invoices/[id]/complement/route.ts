import { NextResponse } from 'next/server';
import { requireOrgAccess, requireActiveSubscription } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { issuePaymentComplement, planPaymentComplement } from '@/lib/complementoPago';
import { getAppBaseUrl } from '@/lib/url';

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
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite consultar documentos fiscales' } },
      { status: 403 }
    );
  }

  const { id } = await params;

  const { data: milestone } = await supabase
    .from('milestones')
    .select('id, amount, cfdi_status, cfdi_uuid, cfdi_id, cfdi_total, cfdi_payment_method')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
      { status: 404 }
    );
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

  // #128 — the trial gate. Creating new commercial work needs an active plan or
  // a live trial; reading, exporting and collecting stay open.
  const gate = await requireActiveSubscription(auth.ctx);
  if (gate) return gate;


  // Filing a complement by hand is a deliberate act of issuing a stamped
  // document, unlike the automatic one that follows a confirmed payment, so it
  // is held to the same capability as stamping an invoice.
  if (!hasCapability(role, 'issue_cfdi')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite emitir complementos de pago' } },
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
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'El monto del pago no es válido' } },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: { code: outcome.code, message: outcome.message } },
      { status: outcome.status }
    );
  }

  if (!outcome.issued) {
    // Nothing was owed. That is not an error, but the caller asked for a
    // document and is getting none, so the reason has to travel with the 200.
    return NextResponse.json({ issued: false, reason: outcome.reason, message: outcome.message });
  }

  return NextResponse.json({ issued: true, ...outcome.complement });
}

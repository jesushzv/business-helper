/**
 * Complemento de Recepción de Pagos — deciding one is owed, and filing it.
 *
 * `/api/invoices/issue` has accepted `paymentMethod: 'PPD'` since real stamping
 * shipped, and a PPD CFDI is a declaration that the amount is still owed. The
 * SAT then requires a second stamped document — type `P`, its own folio fiscal
 * — within the first days of the month following *each* payment received. The
 * builder for that document existed in lib/facturapi.ts and nothing called it,
 * so the product could put a taxpayer under an obligation and then leave them
 * to hear about it from the SAT.
 *
 * This module is where the obligation is tracked and discharged. It is split in
 * two on purpose:
 *
 *   - {@link planPaymentComplement} is pure. Whether a complement is owed, for
 *     how much, and as which parcialidad is arithmetic over the invoice total
 *     and the complements already filed — the part that has to be right, and
 *     the part worth testing without a PAC.
 *   - {@link issuePaymentComplement} does the IO: PAC, storage, row.
 *
 * A complement is a real stamped document the tenant's PAC bills for, exactly
 * like the invoice it settles (#221), and a failure leaves a `failed` row
 * behind rather than vanishing: the obligation outlives the failed attempt and
 * the user needs to see that it is outstanding.
 */

import {
  buildComplementoPagoPayload,
  deriveCFDITaxTreatment,
  type QuoteTaxProfile,
} from './facturapi';
import { resolvePacCredentials } from './pacConnection';
import { downloadCFDIDocuments, stampInvoice } from './pacClient';
import { storeCFDIDocuments } from './cfdiStorage';

/** Money, to the two decimals the SAT reads. */
function toMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** Reads a numeric column that PostgREST returns as a string. */
export function toAmount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The milestone fields the decision depends on. */
export interface ComplementMilestoneState {
  amount?: number | string | null;
  /** The PAC's own total for the stamped document; authoritative over `amount`. */
  cfdi_total?: number | string | null;
  cfdi_status?: string | null;
  /** SAT MetodoPago of the stamped document. NULL predates the column and means PUE. */
  cfdi_payment_method?: string | null;
  cfdi_uuid?: string | null;
  cfdi_id?: string | null;
}

/** A complement already on record for the milestone. */
export interface ComplementRecordState {
  installment?: number | null;
  amount?: number | string | null;
  status?: string | null;
}

export type ComplementSkipReason =
  | 'not_stamped'
  | 'not_ppd'
  | 'cancelled'
  | 'settled'
  | 'no_payment';

export type ComplementPlan =
  | { required: false; reason: ComplementSkipReason; message: string }
  | {
      required: true;
      /** SAT NumParcialidad. */
      installment: number;
      /** ImpPagado. */
      amount: number;
      /** ImpSaldoAnt. */
      lastBalance: number;
      /** ImpSaldoInsoluto. */
      remainingBalance: number;
      /** True when this payment closes the invoice. */
      settles: boolean;
    };

/**
 * Decides whether a payment on this milestone owes the SAT a complement.
 *
 * The balance is tracked against the CFDI's own total rather than the
 * milestone amount: the PAC recomputes taxes from the pre-tax base, so the two
 * can differ by a rounding step, and it is the document the SAT reconciles
 * against. `cfdi_total` is NULL for anything stamped before it was recorded, in
 * which case the milestone amount is the best available stand-in.
 *
 * A payment larger than the outstanding balance is capped rather than refused.
 * Over-payment is not representable in a complement — ImpPagado may not exceed
 * ImpSaldoAnt — and the excess is not something a tax document can absorb.
 */
export function planPaymentComplement(
  milestone: ComplementMilestoneState,
  complements: ComplementRecordState[] = [],
  requestedAmount?: number | null
): ComplementPlan {
  if (milestone.cfdi_status === 'cancelled') {
    return {
      required: false,
      reason: 'cancelled',
      message: 'La factura de este cobro está cancelada ante el SAT; no procede un complemento de pago.',
    };
  }

  if (milestone.cfdi_status !== 'issued' || !(milestone.cfdi_uuid || milestone.cfdi_id)) {
    return {
      required: false,
      reason: 'not_stamped',
      message: 'Este cobro no tiene una factura timbrada, así que no genera complemento de pago.',
    };
  }

  // NULL predates the column. Every document stamped before it existed went out
  // as PUE — that is what the route defaulted to and the only thing the UI
  // could produce — and a PUE invoice already records its own payment.
  if ((milestone.cfdi_payment_method || 'PUE') !== 'PPD') {
    return {
      required: false,
      reason: 'not_ppd',
      message: 'La factura de este cobro es PUE: el pago ya está declarado en ella.',
    };
  }

  const total = toMoney(
    toAmount(milestone.cfdi_total) > 0 ? toAmount(milestone.cfdi_total) : toAmount(milestone.amount)
  );

  const issued = complements.filter((c) => c.status === 'issued');
  const paid = toMoney(issued.reduce((sum, c) => sum + toAmount(c.amount), 0));
  const lastBalance = toMoney(total - paid);

  if (lastBalance <= 0) {
    return {
      required: false,
      reason: 'settled',
      message: 'Esta factura PPD ya está saldada con los complementos de pago emitidos.',
    };
  }

  const requested = typeof requestedAmount === 'number' ? requestedAmount : null;
  const raw = requested !== null && Number.isFinite(requested) ? requested : lastBalance;

  if (raw <= 0) {
    return {
      required: false,
      reason: 'no_payment',
      message: 'No hay un monto de pago que declarar en un complemento.',
    };
  }

  const amount = toMoney(Math.min(raw, lastBalance));
  const remainingBalance = toMoney(lastBalance - amount);

  return {
    required: true,
    // The parcialidad counts payments applied to the document, so a failed
    // attempt does not consume one — its row is excluded from `issued`.
    installment: issued.length + 1,
    amount,
    lastBalance,
    remainingBalance,
    settles: remainingBalance === 0,
  };
}

export interface IssuedComplement {
  complementId: string;
  uuid: string;
  installment: number;
  amount: number;
  remainingBalance: number;
  environment: 'sandbox' | 'live';
  settles: boolean;
  xmlUrl: string | null;
  pdfUrl: string | null;
  warning: string | null;
}

export type ComplementOutcome =
  | { ok: true; issued: false; reason: ComplementSkipReason; message: string }
  | { ok: true; issued: true; complement: IssuedComplement }
  | { ok: false; code: string; message: string; status: number };

export interface IssueComplementParams {
  /** Request-scoped client. Tenant reads and writes go through it so RLS still applies. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  /** Service-role client, for the PAC key, the private bucket and the audit log. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  organizationId: string;
  userId: string;
  milestoneId: string;
  /** What was received. Defaults to the whole outstanding balance. */
  amount?: number | null;
  /** SAT c_FormaPago. '03' (transferencia) is what a SPEI confirmation means. */
  paymentForm?: string | null;
  /** FechaPago. Defaults to now. */
  paymentDate?: string | null;
  /** NumOperacion — the SPEI tracking reference, when there is one. */
  operationNumber?: string | null;
  /** Base URL for the document download links written onto the row. */
  baseUrl?: string;
}

/**
 * Files the complement for one payment.
 *
 * The order matters. The row is inserted as `pending` *before* the PAC is
 * contacted, because its unique index on (milestone_id, installment) is what
 * stops two confirmations racing on the same milestone from stamping the same
 * parcialidad twice — a duplicate complement can only be undone by cancelling
 * it at the SAT.
 *
 * Nothing after a successful stamp may turn the result into a failure: the
 * document exists at the SAT from that moment, and the caller needs its folio
 * even if the copies could not be stored.
 */
export async function issuePaymentComplement(
  params: IssueComplementParams
): Promise<ComplementOutcome> {
  const { supabase, service, organizationId, userId, milestoneId } = params;

  const { data: milestone } = await supabase
    .from('milestones')
    .select(
      'id, label, amount, contract_id, cfdi_status, cfdi_uuid, cfdi_id, cfdi_total, ' +
        'cfdi_payment_method, contracts(quote_id, clients(name, rfc, regimen_fiscal, codigo_postal, cfdi_use))'
    )
    .eq('id', milestoneId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!milestone) {
    return { ok: false, code: 'NOT_FOUND', message: 'Cobro no encontrado', status: 404 };
  }

  const { data: existing, error: existingError } = await supabase
    .from('cfdi_payment_complements')
    .select('installment, amount, status')
    .eq('milestone_id', milestoneId)
    .eq('organization_id', organizationId);

  if (existingError) {
    console.error('[cfdi] could not read payment complements:', existingError.message);
    return {
      ok: false,
      code: 'SERVER_ERROR',
      message: 'No se pudieron consultar los complementos de pago de este cobro.',
      status: 500,
    };
  }

  const plan = planPaymentComplement(milestone, existing || [], params.amount ?? null);

  if (!plan.required) {
    return { ok: true, issued: false, reason: plan.reason, message: plan.message };
  }

  const contract = firstOf(milestone.contracts);
  const client = firstOf(contract?.clients);

  if (!client?.rfc || !client?.regimen_fiscal || !client?.codigo_postal) {
    return {
      ok: false,
      code: 'INVALID_SAT_METADATA',
      message:
        'Faltan datos fiscales del cliente (RFC, régimen o código postal) para emitir el complemento de pago.',
      status: 400,
    };
  }

  const pac = await resolvePacCredentials(service, organizationId);
  if (!pac.ok) {
    return { ok: false, code: pac.code, message: pac.message, status: 503 };
  }

  const credentials = pac.credentials;

  if (process.env.NODE_ENV === 'production' && credentials.environment === 'sandbox') {
    return {
      ok: false,
      code: 'PAC_SANDBOX_KEY',
      message:
        'La llave de PAC conectada es de pruebas y no emite complementos válidos ante el SAT. Conecta tu llave de producción (sk_live_) en Ajustes.',
      status: 400,
    };
  }

  const paymentDate = params.paymentDate || new Date().toISOString();
  const paymentForm = params.paymentForm || '03';
  const operationNumber = params.operationNumber || null;

  const { data: row, error: insertError } = await supabase
    .from('cfdi_payment_complements')
    .insert({
      organization_id: organizationId,
      milestone_id: milestoneId,
      installment: plan.installment,
      amount: plan.amount,
      last_balance: plan.lastBalance,
      remaining_balance: plan.remainingBalance,
      payment_form: paymentForm,
      payment_date: paymentDate,
      operation_number: operationNumber,
      status: 'pending',
      cfdi_provider: credentials.provider,
      cfdi_environment: credentials.environment,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    // 23505: the partial unique index on (milestone_id, installment) — another
    // request is already filing this parcialidad.
    const duplicate = (insertError as { code?: string } | null)?.code === '23505';
    console.error('[cfdi] could not record payment complement:', insertError?.message);

    return {
      ok: false,
      code: duplicate ? 'COMPLEMENT_IN_PROGRESS' : 'SERVER_ERROR',
      message: duplicate
        ? 'Ya se está emitiendo el complemento de pago de esta parcialidad.'
        : 'No se pudo registrar el complemento de pago.',
      status: duplicate ? 409 : 500,
    };
  }

  const complementId = row.id as string;

  const recordFailure = async (message: string) => {
    await supabase
      .from('cfdi_payment_complements')
      .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
      .eq('id', complementId)
      .eq('organization_id', organizationId);
  };

  const { data: quote } = contract?.quote_id
    ? await supabase
        .from('quotes')
        .select('subtotal_amount, iva_amount, retencion_isr_amount, retencion_iva_amount, total_amount')
        .eq('id', contract.quote_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    : { data: null };

  const payload = buildComplementoPagoPayload({
    customer: {
      name: client.name,
      rfc: client.rfc,
      regimen_fiscal: client.regimen_fiscal,
      codigo_postal: client.codigo_postal,
    },
    uuid: milestone.cfdi_uuid,
    invoiceId: milestone.cfdi_id,
    amount: plan.amount,
    lastBalance: plan.lastBalance,
    installment: plan.installment,
    paymentForm,
    operationNumber,
    date: paymentDate,
    treatment: deriveCFDITaxTreatment(quote as QuoteTaxProfile | null),
  });

  // Keyed by milestone *and* parcialidad, but as a correlation id only —
  // Facturapi does not deduplicate on external_id (verified live 2026-08-12,
  // #26). What actually prevents a retry stamping the same parcialidad twice
  // is the unique index on (milestone_id, installment) that the insert below
  // hits; the second genuine payment carries the next installment number and
  // passes it.
  const stamp = await stampInvoice(
    credentials,
    payload as unknown as Record<string, unknown>,
    `complement:${milestoneId}:${plan.installment}`
  );

  if (!stamp.ok) {
    await recordFailure(stamp.message);

    return {
      ok: false,
      code: `PAC_${stamp.code}`,
      message: stamp.message,
      status: stamp.code === 'REJECTED' ? 400 : 502,
    };
  }

  const document = stamp.data;

  // The complement exists at the SAT from here. Storage problems are reported
  // as warnings, never as a failure that would hide the folio from the user.
  let xmlPath: string | null = null;
  let pdfPath: string | null = null;
  let warning: string | null = null;

  const documents = await downloadCFDIDocuments(credentials, document.providerInvoiceId);

  if (documents.ok) {
    const stored = await storeCFDIDocuments(
      service,
      organizationId,
      milestoneId,
      document.uuid,
      documents.data
    );

    if (stored.ok) {
      xmlPath = stored.paths.xmlPath;
      pdfPath = stored.paths.pdfPath;
    } else {
      warning =
        'El complemento de pago se timbró, pero no se pudo guardar una copia del XML y PDF. Descárgalos desde tu PAC.';
    }
  } else {
    warning =
      'El complemento de pago se timbró, pero no se pudo descargar el XML y PDF desde tu PAC. Vuelve a intentarlo más tarde.';
  }

  const { error: updateError } = await supabase
    .from('cfdi_payment_complements')
    .update({
      status: 'issued',
      cfdi_id: document.providerInvoiceId,
      cfdi_uuid: document.uuid,
      cfdi_provider: credentials.provider,
      cfdi_environment: credentials.environment,
      cfdi_xml_path: xmlPath,
      cfdi_pdf_path: pdfPath,
      stamped_at: document.stampedAt,
      error: warning,
      updated_at: new Date().toISOString(),
    })
    .eq('id', complementId)
    .eq('organization_id', organizationId);

  if (updateError) {
    console.error('[cfdi] complement stamped but not recorded:', updateError.message);
    return {
      ok: false,
      code: 'COMPLEMENT_NOT_RECORDED',
      message: `El complemento de pago se timbró con folio fiscal ${document.uuid}, pero no se pudo guardar en el cobro. Anota el folio y contacta a soporte.`,
      status: 500,
    };
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    contract_id: milestone.contract_id,
    action: 'cfdi.complement_issued',
    actor: userId,
    details:
      `Complemento de pago ${document.uuid} (parcialidad ${plan.installment}) por ` +
      `$${plan.amount.toFixed(2)} MXN sobre el CFDI ${milestone.cfdi_uuid} del cobro ${milestone.label}. ` +
      `Saldo insoluto $${plan.remainingBalance.toFixed(2)} MXN.`,
  });

  const base = params.baseUrl ? params.baseUrl.replace(/\/$/, '') : '';
  const documentUrl = (type: 'xml' | 'pdf') =>
    `${base}/api/invoices/${milestoneId}/document?type=${type}&complement=${complementId}`;

  return {
    ok: true,
    issued: true,
    complement: {
      complementId,
      uuid: document.uuid,
      installment: plan.installment,
      amount: plan.amount,
      remainingBalance: plan.remainingBalance,
      environment: credentials.environment,
      settles: plan.settles,
      xmlUrl: xmlPath ? documentUrl('xml') : null,
      pdfUrl: pdfPath ? documentUrl('pdf') : null,
      warning,
    },
  };
}

/** PostgREST returns an embedded to-one relation as an object, or an array under some selects. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

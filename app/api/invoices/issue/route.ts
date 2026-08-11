import { NextResponse } from 'next/server';
import { requireOrgAccess, requireActiveSubscription } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  buildMilestoneLineItem,
  deriveCFDITaxTreatment,
  validateInvoiceParties,
} from '@/lib/facturapi';
import { resolvePacCredentials } from '@/lib/pacConnection';
import { downloadCFDIDocuments, stampInvoice } from '@/lib/pacClient';
import { storeCFDIDocuments } from '@/lib/cfdiStorage';
import {
  currentFolioPeriod,
  describeFolioExhaustion,
  resolveFolioAllowance,
} from '@/lib/cfdiFolios';
import { getAppBaseUrl } from '@/lib/url';
import { track } from '@/lib/analytics';

/**
 * CFDI 4.0 issuance.
 *
 * This route used to call `simulateInvoiceStamping`, which fabricated an id and
 * two storage.businesshelper.mx URLs, and wrote them onto the milestone as
 * `cfdi_status: 'issued'`. No PAC was contacted and no tax document existed, so
 * a business could read its own dashboard, believe it had invoiced a client,
 * and file accordingly.
 *
 * It now stamps for real, through the organization's own PAC account or the
 * platform's (lib/pacConnection.ts). Every outcome is one of:
 *
 *   - a document with a SAT UUID, its XML and PDF stored, `cfdi_status: 'issued'`
 *   - `cfdi_status: 'failed'` with the reason recorded and returned
 *   - a 4xx that never reaches the PAC (missing fiscal data, no folios, no PAC)
 *
 * There is no simulated path. A CFDI cannot be un-issued — only cancelled, with
 * a motive, on record — so the route also refuses to stamp a milestone that
 * already carries one.
 */

/** Reads a numeric column that PostgREST returns as a string. */
function amountOf(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** PostgREST returns an embedded to-one relation as an object, or an array under some selects. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role } = auth.ctx;

  // #128 — the trial gate. Creating new commercial work needs an active plan or
  // a live trial; reading, exporting and collecting stay open.
  const gate = await requireActiveSubscription(auth.ctx);
  if (gate) return gate;


  // Stamping commits the organization's RFC to a document it cannot withdraw
  // without filing a cancellation. It is not a `member` action.
  if (!hasCapability(role, 'issue_cfdi')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite emitir facturas CFDI' } },
      { status: 403 }
    );
  }

  // The PAC key is sealed in a table only the owner can read, and the folio
  // ledger is moved by SECURITY DEFINER functions granted to the service role.
  // Both are reached with the service client, after the checks above.
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

  let body: { milestoneId?: string; paymentMethod?: string; paymentForm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Solicitud inválida' } },
      { status: 400 }
    );
  }

  const milestoneId = typeof body?.milestoneId === 'string' ? body.milestoneId : '';
  if (!milestoneId) {
    return NextResponse.json(
      { error: { code: 'MISSING_MILESTONE', message: 'ID de hito/receivable es requerido' } },
      { status: 400 }
    );
  }

  const paymentMethod = body?.paymentMethod === 'PPD' ? 'PPD' : 'PUE';

  // Scoped to the caller's organization: without the filter the target would be
  // caller-supplied, and any id would be accepted.
  const { data: milestone, error: milestoneError } = await supabase
    .from('milestones')
    .select(
      'id, label, amount, cfdi_status, cfdi_uuid, contract_id, ' +
        'contracts(title, quote_id, clients(name, rfc, regimen_fiscal, codigo_postal, cfdi_use))'
    )
    .eq('id', milestoneId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (milestoneError || !milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
      { status: 404 }
    );
  }

  if (milestone.cfdi_status === 'issued' && milestone.cfdi_uuid) {
    return NextResponse.json(
      {
        error: {
          code: 'ALREADY_ISSUED',
          message: `Este cobro ya tiene una factura timbrada (${milestone.cfdi_uuid}). Cancélala ante el SAT antes de emitir otra.`,
        },
      },
      { status: 409 }
    );
  }

  // The generated database types omit the `Relationships` key supabase-js
  // needs to resolve a schema, so the typed client resolves table rows to
  // `never`. Same cast as the other service-role callers in this app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;

  const { data: organization } = await supabase
    .from('organizations')
    .select(
      'id, name, rfc, regimen_fiscal, codigo_postal, subscription_tier, ' +
        'cfdi_folios_used, cfdi_folios_period, cfdi_folios_purchased'
    )
    .eq('id', organizationId)
    .maybeSingle();

  const contract = firstOf(milestone.contracts);
  const client = firstOf(contract?.clients);

  const parties = validateInvoiceParties(
    {
      name: organization?.name || '',
      rfc: organization?.rfc,
      regimen_fiscal: organization?.regimen_fiscal,
      codigo_postal: organization?.codigo_postal,
    },
    {
      name: client?.name || '',
      rfc: client?.rfc,
      regimen_fiscal: client?.regimen_fiscal,
      codigo_postal: client?.codigo_postal,
      cfdi_use: client?.cfdi_use,
    }
  );

  if (!parties.isValid) {
    return NextResponse.json(
      { error: { code: 'INVALID_SAT_METADATA', message: parties.errors.join(' ') } },
      { status: 400 }
    );
  }

  const pac = await resolvePacCredentials(service, organizationId);
  if (!pac.ok) {
    return NextResponse.json(
      { error: { code: pac.code, message: pac.message } },
      { status: 503 }
    );
  }

  const credentials = pac.credentials;

  // A sandbox key returns a complete-looking document with no fiscal validity.
  // In production that is the original bug wearing a PAC's response.
  if (process.env.NODE_ENV === 'production' && credentials.environment === 'sandbox') {
    return NextResponse.json(
      {
        error: {
          code: 'PAC_SANDBOX_KEY',
          message:
            'La llave de PAC conectada es de pruebas y no emite facturas válidas ante el SAT. Conecta tu llave de producción (sk_live_) en Ajustes.',
        },
      },
      { status: 400 }
    );
  }

  // Folios are the platform's cost, so they are only spent on the platform's
  // account. A tenant stamping with its own PAC is billed by that PAC.
  const meterFolios = credentials.source === 'platform';
  const period = currentFolioPeriod();
  let folioSource: string | null = null;

  if (meterFolios) {
    const allowance = resolveFolioAllowance(organization, period);

    const { data: reservation, error: reservationError } = await service.rpc(
      'reserve_cfdi_folio',
      {
        p_organization_id: organizationId,
        p_period: period,
        p_included: allowance.included,
      }
    );

    if (reservationError) {
      console.error('[cfdi] folio reservation failed:', reservationError.message);
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo reservar el folio CFDI' } },
        { status: 500 }
      );
    }

    if (!reservation?.granted) {
      return NextResponse.json(
        {
          error: {
            code: 'FOLIOS_EXHAUSTED',
            message: describeFolioExhaustion(allowance),
          },
          folios: { included: allowance.included, purchased: allowance.purchased, remaining: 0 },
        },
        { status: 402 }
      );
    }

    folioSource = typeof reservation.source === 'string' ? reservation.source : 'included';
  }

  /** Puts a reserved folio back when the document was never stamped. */
  const releaseFolio = async () => {
    if (!meterFolios || !folioSource) return;
    const { error } = await service.rpc('release_cfdi_folio', {
      p_organization_id: organizationId,
      p_period: period,
      p_source: folioSource,
    });
    if (error) {
      console.error('[cfdi] folio release failed:', error.message);
    }
  };

  /** Records a failed attempt on the milestone so the UI can show what went wrong. */
  const recordFailure = async (message: string) => {
    await supabase
      .from('milestones')
      .update({ cfdi_status: 'failed', cfdi_error: message })
      .eq('id', milestoneId)
      .eq('organization_id', organizationId);
  };

  // 'pending' before the call, not after: if the PAC times out, the milestone
  // must not still read as never attempted while a document may exist.
  await supabase
    .from('milestones')
    .update({ cfdi_status: 'pending', cfdi_error: null })
    .eq('id', milestoneId)
    .eq('organization_id', organizationId);

  const { data: quote } = contract?.quote_id
    ? await supabase
        .from('quotes')
        .select('subtotal_amount, iva_amount, retencion_isr_amount, retencion_iva_amount, total_amount')
        .eq('id', contract.quote_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    : { data: null };

  const treatment = deriveCFDITaxTreatment(quote);
  const description = contract?.title
    ? `${contract.title} — ${milestone.label}`
    : milestone.label;

  const payload = {
    customer: {
      legal_name: client!.name,
      tax_id: String(client!.rfc).toUpperCase().trim(),
      tax_system: client!.regimen_fiscal,
      zip: client!.codigo_postal,
    },
    use: client!.cfdi_use || 'G03',
    payment_form: paymentMethod === 'PPD' ? '99' : body?.paymentForm || '03',
    payment_method: paymentMethod,
    currency: 'MXN',
    items: [buildMilestoneLineItem(description, amountOf(milestone.amount), treatment)],
  };

  // The milestone id keys the idempotency: a retried click after a timeout must
  // not stamp a second document against the same cobro.
  const stamp = await stampInvoice(credentials, payload, `milestone:${milestoneId}`);

  if (!stamp.ok) {
    await releaseFolio();
    await recordFailure(stamp.message);

    return NextResponse.json(
      { error: { code: `PAC_${stamp.code}`, message: stamp.message } },
      { status: stamp.code === 'REJECTED' ? 400 : 502 }
    );
  }

  const document = stamp.data;

  // From here the CFDI exists at the SAT. Nothing below may turn the response
  // into a failure — the user needs the UUID even if a copy could not be filed.
  const baseUrl = getAppBaseUrl();
  const documentUrl = (type: 'xml' | 'pdf') =>
    `${baseUrl}/api/invoices/${milestoneId}/document?type=${type}`;

  let xmlPath: string | null = null;
  let pdfPath: string | null = null;
  let storageWarning: string | null = null;

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
      storageWarning =
        'La factura se timbró, pero no se pudo guardar una copia del XML y PDF. Descárgalos desde tu PAC.';
    }
  } else {
    storageWarning =
      'La factura se timbró, pero no se pudo descargar el XML y PDF desde tu PAC. Vuelve a intentarlo más tarde.';
  }

  const { error: updateError } = await supabase
    .from('milestones')
    .update({
      cfdi_id: document.providerInvoiceId,
      cfdi_uuid: document.uuid,
      cfdi_status: 'issued',
      cfdi_provider: credentials.provider,
      cfdi_environment: credentials.environment,
      cfdi_stamped_at: document.stampedAt,
      // A PPD document declares the amount as still owed and obliges the
      // taxpayer to file a payment complement for every payment received
      // afterwards. Recording the method is what lets
      // /api/receivables/[id]/confirm know that obligation exists — without it
      // a PPD invoice is indistinguishable from a PUE one after stamping.
      cfdi_payment_method: paymentMethod,
      // The PAC's own total. A complement's balances must reconcile against the
      // document, which can differ from the milestone amount by a rounding step
      // once taxes are recomputed from the base.
      cfdi_total: document.total ?? null,
      cfdi_error: storageWarning,
      cfdi_xml_path: xmlPath,
      cfdi_pdf_path: pdfPath,
      // The legacy URL columns feed the accountant export. They point at this
      // app's authenticated download route, not at a host that serves nothing.
      cfdi_xml_url: xmlPath ? documentUrl('xml') : document.verificationUrl,
      cfdi_pdf_url: pdfPath ? documentUrl('pdf') : document.verificationUrl,
    })
    .eq('id', milestoneId)
    .eq('organization_id', organizationId);

  if (updateError) {
    // The document is stamped and the folio spent; losing the row would leave a
    // CFDI nobody can find. Report it loudly with the UUID in hand.
    console.error('[cfdi] stamped but failed to record milestone:', updateError.message);
    return NextResponse.json(
      {
        error: {
          code: 'STAMP_NOT_RECORDED',
          message: `La factura se timbró con folio fiscal ${document.uuid}, pero no se pudo guardar en el cobro. Anota el folio y contacta a soporte.`,
        },
        uuid: document.uuid,
      },
      { status: 500 }
    );
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    contract_id: milestone.contract_id,
    action: 'cfdi.issued',
    actor: userId,
    details: `CFDI ${document.uuid} timbrado para el cobro ${milestone.label} (${credentials.environment}, PAC ${credentials.source})`,
  });

  track(
    'cfdi_issued',
    {
      organization_id: organizationId,
      milestone_id: milestoneId,
      payment_method: paymentMethod,
      pac_environment: credentials.environment,
      pac_source: credentials.source,
    },
    { distinctId: userId }
  );

  return NextResponse.json({
    cfdiId: document.providerInvoiceId,
    uuid: document.uuid,
    status: 'issued',
    environment: credentials.environment,
    verificationUrl: document.verificationUrl,
    xmlUrl: xmlPath ? documentUrl('xml') : null,
    pdfUrl: pdfPath ? documentUrl('pdf') : null,
    issuedAt: document.stampedAt,
    paymentMethod,
    // A PPD document is not the end of the paperwork: every payment against it
    // owes the SAT a complement. Say so at the moment it is issued rather than
    // letting the user find out from their accountant.
    complementRequired: paymentMethod === 'PPD',
    warning: storageWarning,
  });
}

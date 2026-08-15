import { NextResponse } from 'next/server';
import { readOrganizationTrialState } from '@/lib/organizationTrialGate';
import { TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE } from '@/lib/subscriptionTrial';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  buildCFDICustomer,
  buildMilestoneLineItem,
  deriveCFDITaxTreatment,
  validateInvoiceParties,
} from '@/lib/facturapi';
import { resolvePacCredentials } from '@/lib/pacConnection';
import { downloadCFDIDocuments, findInvoiceByExternalId, stampInvoice } from '@/lib/pacClient';
import {
  acquireStampClaim,
  takeOverStaleClaim,
  releaseStampClaim,
} from '@/lib/cfdiStampClaim';
import { storeCFDIDocuments } from '@/lib/cfdiStorage';
import { getAppBaseUrl } from '@/lib/url';
import { track } from '@/lib/analytics';
import { apiError } from '@/lib/apiError';

/**
 * CFDI 4.0 issuance.
 *
 * This route used to call `simulateInvoiceStamping`, which fabricated an id and
 * two storage.businesshelper.mx URLs, and wrote them onto the milestone as
 * `cfdi_status: 'issued'`. No PAC was contacted and no tax document existed, so
 * a business could read its own dashboard, believe it had invoiced a client,
 * and file accordingly.
 *
 * It now stamps for real, through the organization's own PAC account
 * (lib/pacConnection.ts — there is no platform account, per the BYOK decision
 * in docs/STATUS.md §05). Every outcome is one of:
 *
 *   - a document with a SAT UUID, its XML and PDF stored, `cfdi_status: 'issued'`
 *   - `cfdi_status: 'failed'` with the reason recorded and returned
 *   - a 4xx that never reaches the PAC (missing fiscal data, no PAC connected)
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


  // Stamping commits the organization's RFC to a document it cannot withdraw
  // without filing a cancellation. It is not a `member` action.
  if (!hasCapability(role, 'issue_cfdi')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite emitir facturas CFDI');
  }

  // The PAC key is sealed in a table only the owner can read, reached with the
  // service client after the checks above.
  if (!isServiceRoleConfigured()) {
    return apiError(503, 'BACKEND_NOT_CONFIGURED', 'La facturación CFDI no está configurada en este entorno.');
  }

  let body: { milestoneId?: string; paymentMethod?: string; paymentForm?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_INPUT', 'Solicitud inválida');
  }

  const milestoneId = typeof body?.milestoneId === 'string' ? body.milestoneId : '';
  if (!milestoneId) {
    return apiError(400, 'MISSING_MILESTONE', 'ID de hito/receivable es requerido');
  }

  const paymentMethod = body?.paymentMethod === 'PPD' ? 'PPD' : 'PUE';

  // Scoped to the caller's organization: without the filter the target would be
  // caller-supplied, and any id would be accepted.
  const { data: milestone, error: milestoneError } = await supabase
    .from('milestones')
    .select(
      'id, label, amount, transferred_amount, cfdi_total, cfdi_status, cfdi_uuid, ' +
        'cfdi_environment, contract_id, ' +
        'contracts(title, quote_id, clients(name, rfc, regimen_fiscal, codigo_postal, cfdi_use))'
    )
    .eq('id', milestoneId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (milestoneError || !milestone) {
    return apiError(404, 'NOT_FOUND', 'Cobro no encontrado');
  }

  if (milestone.cfdi_status === 'issued' && milestone.cfdi_uuid) {
    // `uuid`/`environment` ride beside the envelope on every ALREADY_ISSUED:
    // the client reports the existing document, and a sandbox one must keep
    // its "sin validez fiscal" caveat in that report (#264 review). "Cancel it
    // at the SAT" is only real advice for a live document.
    return apiError(409, 'ALREADY_ISSUED', `Este cobro ya tiene una factura timbrada (${milestone.cfdi_uuid}). ${
            milestone.cfdi_environment === 'sandbox'
              ? 'Es un documento de prueba sin validez fiscal.'
              : 'Cancélala ante el SAT antes de emitir otra.'
          }`, { extra: { uuid: milestone.cfdi_uuid, environment: milestone.cfdi_environment ?? null } });
  }

  // The generated database types omit the `Relationships` key supabase-js
  // needs to resolve a schema, so the typed client resolves table rows to
  // `never`. Same cast as the other service-role callers in this app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;

  const { data: organization } = await supabase
    .from('organizations')
    .select('id, name, rfc, regimen_fiscal, codigo_postal')
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
    return apiError(400, 'INVALID_SAT_METADATA', parties.errors.join(' '));
  }

  const pac = await resolvePacCredentials(service, organizationId);
  if (!pac.ok) {
    return apiError(503, pac.code, pac.message);
  }

  const credentials = pac.credentials;

  // A sandbox key returns a complete-looking document with no fiscal validity.
  // In production that is the original bug wearing a PAC's response.
  if (process.env.NODE_ENV === 'production' && credentials.environment === 'sandbox') {
    return apiError(400, 'PAC_SANDBOX_KEY', 'La llave de PAC conectada es de pruebas y no emite facturas válidas ante el SAT. Conecta tu llave de producción (sk_live_) en Ajustes.');
  }

  /** Records a failed attempt on the milestone so the UI can show what went wrong. */
  const recordFailure = async (message: string) => {
    await supabase
      .from('milestones')
      .update({ cfdi_status: 'failed', cfdi_error: message })
      .eq('id', milestoneId)
      .eq('organization_id', organizationId);
  };

  // The external_id every attempt for this milestone sends — and the key the
  // stale-claim reconciliation searches for at the PAC.
  const externalId = `milestone:${milestoneId}`;

  // Claim before stamping (#213). The ALREADY_ISSUED read above is
  // check-then-act — two concurrent requests both pass it, both stamp — and
  // Facturapi's external_id deduplicates nothing (verified live, #26). The
  // primary key on cfdi_stamp_claims makes the second claimant collide here
  // instead of issuing a second document the SAT has on record.
  let claim = await acquireStampClaim(service, organizationId, milestoneId, userId);

  if (!claim.ok && claim.reason === 'stale') {
    // A previous attempt died holding the claim — after a timeout the document
    // may exist at the SAT, so the claim is released only once the PAC's own
    // list confirms no document carries this milestone's external_id.
    const search = await findInvoiceByExternalId(credentials, externalId);

    if (!search.ok) {
      return apiError(502, 'STAMP_RECONCILIATION_FAILED', 'Un intento anterior de timbrado no terminó y no se pudo verificar con tu PAC si la factura ya existe. Intenta de nuevo en unos minutos.');
    }

    if (search.data.document) {
      // The earlier attempt DID stamp. Record the document the SAT already
      // has instead of leaving the milestone in limbo — and never stamp again.
      const found = search.data.document;
      const { data: adopted, error: adoptError } = await supabase
        .from('milestones')
        .update({
          cfdi_id: found.providerInvoiceId,
          cfdi_uuid: found.uuid,
          cfdi_status: 'issued',
          cfdi_provider: credentials.provider,
          cfdi_environment: credentials.environment,
          cfdi_stamped_at: found.stampedAt,
          // From the PAC's listing, never from this retry's request body —
          // the retry can name a different method than the attempt that
          // actually stamped. `null` means the listing did not say.
          cfdi_payment_method: found.paymentMethod,
          cfdi_total: found.total ?? null,
          // The copies were never downloaded here; the PAC still has them.
          cfdi_error:
            'La factura se timbró en un intento anterior y no se guardó una copia del XML y PDF. Descárgalos desde tu PAC.',
          cfdi_xml_url: found.verificationUrl,
          cfdi_pdf_url: found.verificationUrl,
        })
        .eq('id', milestoneId)
        .eq('organization_id', organizationId)
        // The affected row count, not just the error (#128, #336): a milestone
        // deleted between the claim and this write matches nothing, and
        // PostgREST answers that with `{ error: null }` — success, for a
        // document that exists at the SAT and is recorded nowhere. The FK
        // RESTRICT added in 20260814210000 is what makes that delete
        // impossible while the claim is held; this is the same invariant read
        // back rather than assumed.
        .select('id');

      if (adoptError || !adopted || adopted.length === 0) {
        // The document exists at the SAT and the milestone still does not say
        // so. The claim is deliberately kept: released, a retry would pass
        // the ALREADY_ISSUED read and stamp a second document.
        console.error(
          '[cfdi] found orphaned stamp but failed to record it:',
          adoptError?.message ?? 'update matched no milestone row'
        );
        return apiError(500, 'STAMP_NOT_RECORDED', `Un intento anterior timbró la factura con folio fiscal ${found.uuid}, pero no se pudo guardar en el cobro. Anota el folio y vuelve a intentarlo.`, { extra: { uuid: found.uuid } });
      }

      await releaseStampClaim(service, organizationId, milestoneId);

      return apiError(409, 'ALREADY_ISSUED', `Un intento anterior sí timbró la factura (folio fiscal ${found.uuid}). Ya quedó registrada en este cobro; no se emitió una nueva.`, { extra: { uuid: found.uuid, environment: credentials.environment } });
    }

    claim = await takeOverStaleClaim(service, organizationId, milestoneId, userId);
  }

  if (!claim.ok) {
    if (claim.reason === 'error') {
      // Fail closed: without the claim, a concurrent request could stamp a
      // second document the SAT has on record.
      return apiError(502, 'STAMP_CLAIM_FAILED', 'No se pudo iniciar el timbrado de forma segura. Intenta de nuevo.');
    }

    return apiError(409, 'STAMP_IN_PROGRESS', 'Ya hay un timbrado en curso para este cobro. Espera unos segundos y actualiza para ver el resultado, o vuelve a intentarlo en unos minutos.');
  }

  // The ALREADY_ISSUED pre-check above ran before this request held the
  // claim. Re-read now that it does: a stamp recorded by a competing request
  // in between must never be repeated (check-then-act closed on both sides).
  const { data: recheck } = await supabase
    .from('milestones')
    .select('cfdi_status, cfdi_uuid, cfdi_environment')
    .eq('id', milestoneId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (recheck?.cfdi_status === 'issued' && recheck?.cfdi_uuid) {
    await releaseStampClaim(service, organizationId, milestoneId);
    return apiError(409, 'ALREADY_ISSUED', `Este cobro ya tiene una factura timbrada (${recheck.cfdi_uuid}). ${
            recheck.cfdi_environment === 'sandbox'
              ? 'Es un documento de prueba sin validez fiscal.'
              : 'Cancélala ante el SAT antes de emitir otra.'
          }`, { extra: { uuid: recheck.cfdi_uuid, environment: recheck.cfdi_environment ?? null } });
  }

  // 'pending' before the call, not after: if the PAC times out, the milestone
  // must not still read as never attempted while a document may exist.
  await supabase
    .from('milestones')
    .update({
      cfdi_status: 'pending',
      cfdi_error: null,
      // The previous document's total goes with the previous document (#352).
      // `expectedSettlementAmount` ignores `cfdi_total` while the status reads
      // `cancelled`, but this write moves it *off* cancelled — and a failed
      // attempt leaves it on `failed`, which is durable. In both of those the
      // guard no longer fires, so a stale total would make the cobro measure
      // itself against a void document. Cleared here, the contractual amount
      // governs again until a new stamp writes its own total.
      cfdi_total: null,
    })
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
    // The v2 customer shape lives in one exported builder — this route used to
    // assemble it inline and carried the v1 form (flat `zip`) after the
    // builders moved on, which is the drift buildCFDICustomer exists to end.
    customer: buildCFDICustomer({
      name: client!.name,
      rfc: client!.rfc,
      regimen_fiscal: client!.regimen_fiscal,
      codigo_postal: client!.codigo_postal,
    }),
    use: client!.cfdi_use || 'G03',
    payment_form: paymentMethod === 'PPD' ? '99' : body?.paymentForm || '03',
    payment_method: paymentMethod,
    currency: 'MXN',
    items: [buildMilestoneLineItem(description, amountOf(milestone.amount), treatment)],
  };

  // The milestone id rides along as external_id — a correlation id for the
  // stale-claim reconciliation above, NOT a guard: Facturapi does not
  // deduplicate on it (verified live 2026-08-12, #26). The guard is the claim
  // this request now holds.
  const stamp = await stampInvoice(credentials, payload, externalId);

  if (!stamp.ok) {
    // REJECTED/UNAUTHORIZED/NOT_CONFIGURED are definitive: the PAC answered
    // (or was never called) and no document exists, so the claim is released
    // and a genuine retry can proceed. TIMEOUT, UNAVAILABLE and
    // INVALID_RESPONSE are not — the document may exist at the SAT — so the
    // claim is kept, and the next attempt reconciles it against the PAC's
    // list once it goes stale.
    const documentMayExist =
      stamp.code === 'TIMEOUT' || stamp.code === 'UNAVAILABLE' || stamp.code === 'INVALID_RESPONSE';
    if (!documentMayExist) {
      await releaseStampClaim(service, organizationId, milestoneId);
    }

    await recordFailure(stamp.message);

    return apiError(stamp.code === 'REJECTED' ? 400 : 502, `PAC_${stamp.code}`, stamp.message);
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

  const { data: recorded, error: updateError } = await supabase
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
    .eq('organization_id', organizationId)
    // 0 rows changed looks exactly like success (#128), and here "exactly like
    // success" means a live SAT document reported as filed against a milestone
    // that is no longer there. #336's FK RESTRICT closes the delete that
    // causes it; this reads the result back instead of trusting it.
    .select('id');

  if (updateError || !recorded || recorded.length === 0) {
    // The document is stamped and the folio spent; losing the row would leave a
    // CFDI nobody can find. Report it loudly with the UUID in hand. The claim
    // is deliberately NOT released: the milestone does not say 'issued', so
    // without it a retry would stamp a second document — held, the retry hits
    // the stale-claim reconciliation and adopts this one instead.
    console.error(
      '[cfdi] stamped but failed to record milestone:',
      updateError?.message ?? 'update matched no milestone row'
    );
    return apiError(500, 'STAMP_NOT_RECORDED', `La factura se timbró con folio fiscal ${document.uuid}, pero no se pudo guardar en el cobro. Anota el folio y contacta a soporte.`, { extra: { uuid: document.uuid } });
  }

  // Recorded on the milestone — the ALREADY_ISSUED read-guard takes over from
  // here, so the claim has done its job.
  await releaseStampClaim(service, organizationId, milestoneId);

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

import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { simulateInvoiceStamping, validateCFDIMetadata } from '@/lib/facturapi';

/**
 * CFDI 4.0 issuance.
 *
 * IMPORTANT: this does not issue a CFDI. `simulateInvoiceStamping` fabricates
 * an id and two storage URLs; no PAC is contacted and no tax document exists.
 * The route nevertheless wrote `cfdi_status: 'issued'` and those fake URLs onto
 * the milestone, so the product recorded — and showed the user — a stamped
 * invoice the SAT has never seen. That is a compliance problem, not just a
 * missing feature.
 *
 * Until a real PAC integration lands, this endpoint:
 *   - requires a session and scopes the milestone to the caller's organization,
 *   - marks the record `cfdi_status: 'simulated'` rather than `'issued'`,
 *   - returns `simulated: true` so no caller can mistake it for a real stamp.
 *
 * It also refuses to run in production, where a fake tax document is worse
 * than an error.
 */
export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  if (process.env.NODE_ENV === 'production' && process.env.FACTURAPI_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error: {
          code: 'CFDI_NOT_CONFIGURED',
          message: 'La facturación CFDI aún no está disponible.',
        },
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { milestoneId, receiverRfc, lineItems } = body;

    if (!milestoneId) {
      return NextResponse.json(
        { error: { code: 'MISSING_MILESTONE', message: 'ID de hito/receivable es requerido' } },
        { status: 400 }
      );
    }

    // Confirm the milestone belongs to the caller before stamping anything
    // against it. Previously any id was accepted.
    const { data: milestone } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', milestoneId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!milestone) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    if (receiverRfc && Array.isArray(lineItems)) {
      const validation = validateCFDIMetadata({
        issuerRfc: 'ABC120315HD9',
        receiverRfc,
        lineItems
      });

      if (!validation.isValid) {
        return NextResponse.json(
          { error: { code: 'INVALID_SAT_METADATA', message: validation.errors.join(', ') } },
          { status: 400 }
        );
      }
    }

    const stamp = simulateInvoiceStamping(milestoneId);

    const { error: updateError } = await supabase
      .from('milestones')
      .update({
        cfdi_id: stamp.cfdiId,
        // Not 'issued' — nothing was issued.
        cfdi_status: 'simulated',
        cfdi_xml_url: stamp.xmlUrl,
        cfdi_pdf_url: stamp.pdfUrl
      })
      .eq('id', milestoneId)
      .eq('organization_id', organizationId);

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'STAMPING_FAILED', message: 'No se pudo registrar el timbrado' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cfdiId: stamp.cfdiId,
      xmlUrl: stamp.xmlUrl,
      pdfUrl: stamp.pdfUrl,
      status: 'simulated',
      simulated: true,
      issuedAt: stamp.issuedAt
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'STAMPING_FAILED', message: 'Fallo el timbrado' } },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { signCFDIDocumentUrl } from '@/lib/cfdiStorage';

/**
 * Downloads the XML or PDF of a stamped CFDI.
 *
 * The milestone stores bucket paths rather than URLs, and the bucket is
 * private: a stored link would either not resolve (public URL of a private
 * object) or expire (signed URL), and a fiscal record pointing at nothing is
 * the failure this whole change exists to remove. The link is signed here, per
 * request, for the caller who proved they belong to the organization.
 *
 * `?complement=<id>` serves a complemento de pago instead of the invoice. A
 * complement is a separate stamped document with its own folio fiscal, filed
 * against the same milestone, and an accountant needs it as much as the invoice
 * it settles.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  // The same roles that may issue a CFDI or read the organization's finances.
  // A `member` files quotes; it has no reason to pull tax documents.
  if (!hasCapability(role, 'issue_cfdi') && !hasCapability(role, 'view_analytics')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite descargar documentos fiscales' } },
      { status: 403 }
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Almacenamiento no configurado' } },
      { status: 503 }
    );
  }

  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const type = search.get('type') === 'pdf' ? 'pdf' : 'xml';
  const complementId = search.get('complement');

  // The complement is looked up by its own id *and* the milestone it belongs
  // to, so a complement id from another cobro cannot be pulled through this
  // route even inside the same organization.
  const { data: document } = complementId
    ? await supabase
        .from('cfdi_payment_complements')
        .select('id, cfdi_xml_path, cfdi_pdf_path')
        .eq('id', complementId)
        .eq('milestone_id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    : await supabase
        .from('milestones')
        .select('id, cfdi_status, cfdi_xml_path, cfdi_pdf_path')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

  if (!document) {
    return NextResponse.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: complementId ? 'Complemento de pago no encontrado' : 'Cobro no encontrado',
        },
      },
      { status: 404 }
    );
  }

  const path = type === 'pdf' ? document.cfdi_pdf_path : document.cfdi_xml_path;

  if (!path) {
    return NextResponse.json(
      {
        error: {
          code: 'DOCUMENT_NOT_STORED',
          message: complementId
            ? 'Este complemento de pago no tiene un documento guardado.'
            : 'Este cobro no tiene un documento CFDI guardado.',
        },
      },
      { status: 404 }
    );
  }

  const signed = await signCFDIDocumentUrl(createServiceClient(), path);

  if (!signed.ok) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo generar el enlace de descarga' } },
      { status: 502 }
    );
  }

  // A redirect rather than a proxy: the bytes go straight from storage to the
  // browser, and the signed URL expires in minutes.
  return NextResponse.redirect(signed.url, 307);
}

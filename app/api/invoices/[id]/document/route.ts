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
  const type = new URL(request.url).searchParams.get('type') === 'pdf' ? 'pdf' : 'xml';

  const { data: milestone } = await supabase
    .from('milestones')
    .select('id, cfdi_status, cfdi_xml_path, cfdi_pdf_path')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!milestone) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
      { status: 404 }
    );
  }

  const path = type === 'pdf' ? milestone.cfdi_pdf_path : milestone.cfdi_xml_path;

  if (!path) {
    return NextResponse.json(
      {
        error: {
          code: 'DOCUMENT_NOT_STORED',
          message: 'Este cobro no tiene un documento CFDI guardado.',
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

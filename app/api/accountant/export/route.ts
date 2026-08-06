import { NextResponse } from 'next/server';
import { generateMonthlySummaryCSV, buildAccountantZipManifest } from '@/lib/accountantExport';
import { requireOrgAccess } from '@/lib/apiAuth';

/**
 * Accountant export package.
 *
 * NOTE: the milestone data below is still hardcoded demo content — this
 * endpoint does not yet read the tenant's real records. It is guarded and
 * scoped here so it cannot be called anonymously or pointed at another
 * tenant, but it must not be presented to users as a real export until it
 * queries the database. See the CFDI/AI simulation issue.
 */
export async function GET(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  // The organization comes from the session. It was previously read from the
  // query string with an 'org-demo-1' default, so a caller could name any
  // tenant they liked in the exported package.
  const orgId = auth.ctx.organizationId;
  const month = searchParams.get('month') || '2026-08';
  const format = searchParams.get('format') || 'manifest';

  const demoMilestones = [
    {
      id: 'm-101',
      label: 'Anticipo 50% Proyecto Torre Norte',
      amount: 75000,
      due_date: `${month}-15`,
      status: 'confirmed',
      tracking_reference: 'SPEI88912345',
      cfdi_id: 'cfdi_889123_abc',
      cfdi_xml_url: 'https://storage.businesshelper.mx/cfdi/cfdi_889123_abc.xml',
      cfdi_pdf_url: 'https://storage.businesshelper.mx/cfdi/cfdi_889123_abc.pdf',
      receipt_url: 'https://storage.businesshelper.mx/receipts/spei_m101.jpg'
    },
    {
      id: 'm-102',
      label: 'Pago Finiquito Servicios de Ingenieria',
      amount: 45000,
      due_date: `${month}-20`,
      status: 'confirmed',
      tracking_reference: 'SPEI99100223',
      cfdi_id: null,
      cfdi_xml_url: null,
      cfdi_pdf_url: null,
      receipt_url: 'https://storage.businesshelper.mx/receipts/spei_m102.jpg'
    }
  ];

  if (format === 'csv') {
    const csvContent = generateMonthlySummaryCSV(orgId, month, demoMilestones);
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Paquete_Contador_${month}.csv"`
      }
    });
  }

  const manifest = buildAccountantZipManifest(orgId, month, demoMilestones);
  return NextResponse.json(manifest);
}

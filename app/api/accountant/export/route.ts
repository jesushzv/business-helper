import { NextResponse } from 'next/server';
import {
  generateMonthlySummaryCSV,
  buildAccountantZipManifest,
  mapMilestoneRows,
  isValidExportMonth,
  monthDateRange,
} from '@/lib/accountantExport';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';

/**
 * Accountant export package.
 *
 * The milestone data was hardcoded: two invented payments with
 * `storage.businesshelper.mx` CFDI and receipt URLs that resolve to nothing. An
 * accountant handed that package received fiction with the tenant's name on it.
 *
 * It now reads the organization's own milestones for the requested month, and
 * the manifest lists only files that actually exist — a milestone without a
 * stamped CFDI contributes no CFDI entry rather than a plausible-looking link.
 */
export async function GET(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  // The accountant role exists precisely to read this; members do not.
  if (!hasCapability(role, 'view_analytics')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite exportar información fiscal' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  // The organization comes from the session. It was previously read from the
  // query string with an 'org-demo-1' default, so a caller could name any
  // tenant they liked in the exported package.
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const format = searchParams.get('format') || 'manifest';

  if (!isValidExportMonth(month)) {
    return NextResponse.json(
      { error: { code: 'INVALID_MONTH', message: 'El mes debe tener el formato AAAA-MM' } },
      { status: 400 }
    );
  }

  const { start, endExclusive } = monthDateRange(month);

  const { data: rows, error } = await supabase
    .from('milestones')
    .select(
      'id, label, amount, transferred_amount, cfdi_total, cfdi_status, due_date, status, ' +
        'tracking_reference, cfdi_id, cfdi_xml_url, cfdi_pdf_url, receipt_url, confirmed_at, ' +
        'contracts(title, clients(name, rfc))'
    )
    .eq('organization_id', organizationId)
    .gte('due_date', start)
    .lt('due_date', endExclusive)
    .order('due_date', { ascending: true });

  if (error) {
    // An empty package would read as "no business this month", which is a
    // different and more damaging claim than an error.
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo generar el paquete contable' } },
      { status: 500 }
    );
  }

  const milestones = mapMilestoneRows(rows);

  if (format === 'csv') {
    const csvContent = generateMonthlySummaryCSV(organizationId, month, milestones);
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Paquete_Contador_${month}.csv"`
      }
    });
  }

  const manifest = buildAccountantZipManifest(organizationId, month, milestones);
  return NextResponse.json(manifest);
}

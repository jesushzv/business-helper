/**
 * 1-Click Accountant Export Package Engine — Business Helper
 *
 * Compiles monthly financial summaries, client RFC logs, CFDI XMLs/PDFs, and SPEI proof URLs
 * into structured CSV reports and downloadable ZIP package manifests for external accountants.
 *
 * The route that serves these used to pass in two hardcoded milestones with
 * `storage.businesshelper.mx` URLs that resolve to nothing, so the package an
 * accountant received described transactions that never happened. The shaping
 * functions here are unchanged in spirit; `mapMilestoneRows` is what the route
 * now feeds them from the tenant's own records.
 */

export interface MilestoneExportItem {
  id: string;
  label: string;
  amount: number;
  due_date: string;
  status: string;
  tracking_reference?: string | null;
  cfdi_id?: string | null;
  cfdi_xml_url?: string | null;
  cfdi_pdf_url?: string | null;
  receipt_url?: string | null;
  /** Resolved through the milestone's contract; an accountant needs the payer. */
  client_name?: string | null;
  client_rfc?: string | null;
  confirmed_at?: string | null;
}

/** Shape of a `milestones` row selected with `contracts(title, clients(name, rfc))`. */
export interface MilestoneRow {
  id: string;
  label: string;
  amount: number | string;
  due_date: string;
  status: string;
  tracking_reference?: string | null;
  cfdi_id?: string | null;
  cfdi_xml_url?: string | null;
  cfdi_pdf_url?: string | null;
  receipt_url?: string | null;
  confirmed_at?: string | null;
  contracts?: ContractJoin | ContractJoin[] | null;
}

interface ContractJoin {
  title?: string | null;
  clients?: ClientJoin | ClientJoin[] | null;
}

interface ClientJoin {
  name?: string | null;
  rfc?: string | null;
}

/** PostgREST returns an embedded to-one relation as an object, or an array under some selects. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Projects database rows onto the export shape, flattening the client join. */
export function mapMilestoneRows(rows: MilestoneRow[] | null | undefined): MilestoneExportItem[] {
  return (rows || []).map((row) => {
    const client = firstOf(firstOf(row.contracts)?.clients);
    return {
      id: row.id,
      label: row.label,
      // numeric(12,2) arrives as a string from PostgREST.
      amount: typeof row.amount === 'string' ? Number(row.amount) : row.amount,
      due_date: row.due_date,
      status: row.status,
      tracking_reference: row.tracking_reference ?? null,
      cfdi_id: row.cfdi_id ?? null,
      cfdi_xml_url: row.cfdi_xml_url ?? null,
      cfdi_pdf_url: row.cfdi_pdf_url ?? null,
      receipt_url: row.receipt_url ?? null,
      client_name: client?.name ?? null,
      client_rfc: client?.rfc ?? null,
      confirmed_at: row.confirmed_at ?? null,
    };
  });
}

/** `YYYY-MM`, the only month format the export accepts. */
export function isValidExportMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '');
}

/** Inclusive first day and exclusive last day of the requested month, in UTC. */
export function monthDateRange(month: string): { start: string; endExclusive: string } {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthIndex, 1));
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: endExclusive.toISOString().slice(0, 10),
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function generateMonthlySummaryCSV(
  organizationId: string,
  monthYear: string,
  milestones: MilestoneExportItem[]
): string {
  const headers = [
    'ID',
    'Concepto',
    'Monto',
    'Estado',
    'Fecha Vencimiento',
    'Clave Rastreo',
    'CFDI ID',
    'Cliente',
    'RFC Cliente',
    'Fecha Confirmacion',
  ];

  const rows = (milestones || []).map((m) => [
    m.id,
    csvCell(m.label || ''),
    m.amount,
    m.status,
    m.due_date,
    m.tracking_reference || 'N/A',
    m.cfdi_id || 'N/A',
    csvCell(m.client_name || 'N/A'),
    m.client_rfc || 'N/A',
    m.confirmed_at || 'N/A',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function buildAccountantZipManifest(
  organizationId: string,
  monthYear: string,
  milestones: MilestoneExportItem[]
) {
  const files: Array<{ name: string; type: string; url: string }> = [];

  // The CSV link carries no orgId: the export is scoped to the caller's session,
  // and a tenant id in the query string was how the endpoint used to be pointed
  // at other organizations.
  files.push({
    name: `Resumen_Mensual_${monthYear}.csv`,
    type: 'text/csv',
    url: `/api/accountant/export?month=${monthYear}&format=csv`
  });

  (milestones || []).forEach((m) => {
    if (m.cfdi_xml_url) {
      files.push({
        name: `CFDI_${m.cfdi_id || m.id}.xml`,
        type: 'application/xml',
        url: m.cfdi_xml_url
      });
    }
    if (m.cfdi_pdf_url) {
      files.push({
        name: `Factura_${m.cfdi_id || m.id}.pdf`,
        type: 'application/pdf',
        url: m.cfdi_pdf_url
      });
    }
    if (m.receipt_url) {
      files.push({
        name: `Comprobante_SPEI_${m.id}.jpg`,
        type: 'image/jpeg',
        url: m.receipt_url
      });
    }
  });

  return {
    organizationId,
    month: monthYear,
    generatedAt: new Date().toISOString(),
    totalMilestonesCount: (milestones || []).length,
    totalAmount: (milestones || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0),
    filesCount: files.length,
    files
  };
}

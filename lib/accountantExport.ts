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
  /**
   * PUE (paid on issue) or PPD (installments). An accountant reading the
   * package could not previously tell the two apart, and the difference
   * decides whether payment complements are owed at all (#31).
   */
  cfdi_payment_method?: string | null;
  /** Resolved through the milestone's contract; an accountant needs the payer. */
  client_name?: string | null;
  client_rfc?: string | null;
  confirmed_at?: string | null;
  /** The stamped payment complements filed against this invoice (#31). */
  complements?: ComplementExportItem[];
}

/**
 * One complemento de pago — a separate stamped document with its own folio.
 *
 * A PPD invoice's complements are the paperwork that proves *when* it was
 * paid, which is the entire reason the document type exists. The export
 * modelled one CFDI per milestone and shipped neither the rows nor the files,
 * so for a PPD invoice the accountant got the invoice and silently nothing
 * else — and had to notice the gap and go to the PAC portal, which is the
 * workflow this feature replaces (#31).
 */
export interface ComplementExportItem {
  id: string;
  milestone_id: string;
  /** SAT NumParcialidad, 1-based. */
  installment: number;
  /** ImpPagado — what was received in this payment. */
  amount: number;
  last_balance: number;
  remaining_balance: number;
  payment_date?: string | null;
  operation_number?: string | null;
  status: string;
  /** The complement's own folio fiscal, distinct from the invoice's. */
  cfdi_uuid?: string | null;
  cfdi_xml_path?: string | null;
  cfdi_pdf_path?: string | null;
  /** Carried from the parent so each complement row stands on its own. */
  client_name?: string | null;
  client_rfc?: string | null;
  /** The folio of the invoice this complement settles. */
  invoice_cfdi_id?: string | null;
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
  cfdi_payment_method?: string | null;
  confirmed_at?: string | null;
  contracts?: ContractJoin | ContractJoin[] | null;
  cfdi_payment_complements?: ComplementRow[] | null;
}

/** Shape of an embedded `cfdi_payment_complements(...)` row. */
export interface ComplementRow {
  id: string;
  installment: number | string;
  amount: number | string;
  last_balance: number | string;
  remaining_balance: number | string;
  payment_date?: string | null;
  operation_number?: string | null;
  status: string;
  cfdi_uuid?: string | null;
  cfdi_xml_path?: string | null;
  cfdi_pdf_path?: string | null;
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
    const clientName = client?.name ?? null;
    const clientRfc = client?.rfc ?? null;
    return {
      id: row.id,
      label: row.label,
      // numeric(12,2) arrives as a string from PostgREST.
      amount: toNumber(row.amount),
      due_date: row.due_date,
      status: row.status,
      tracking_reference: row.tracking_reference ?? null,
      cfdi_id: row.cfdi_id ?? null,
      cfdi_xml_url: row.cfdi_xml_url ?? null,
      cfdi_pdf_url: row.cfdi_pdf_url ?? null,
      receipt_url: row.receipt_url ?? null,
      cfdi_payment_method: row.cfdi_payment_method ?? null,
      client_name: clientName,
      client_rfc: clientRfc,
      confirmed_at: row.confirmed_at ?? null,
      // Ordered by parcialidad: SAT numbering is sequential per document, and
      // an accountant reads them in that order.
      complements: (row.cfdi_payment_complements || [])
        .map((c) => ({
          id: c.id,
          milestone_id: row.id,
          installment: toNumber(c.installment),
          amount: toNumber(c.amount),
          last_balance: toNumber(c.last_balance),
          remaining_balance: toNumber(c.remaining_balance),
          payment_date: c.payment_date ?? null,
          operation_number: c.operation_number ?? null,
          status: c.status,
          cfdi_uuid: c.cfdi_uuid ?? null,
          cfdi_xml_path: c.cfdi_xml_path ?? null,
          cfdi_pdf_path: c.cfdi_pdf_path ?? null,
          client_name: clientName,
          client_rfc: clientRfc,
          invoice_cfdi_id: row.cfdi_id ?? null,
        }))
        .sort((a, b) => a.installment - b.installment),
    };
  });
}

/** Every complement across the package, flattened for its own sheet. */
export function allComplements(milestones: MilestoneExportItem[] | null | undefined): ComplementExportItem[] {
  return (milestones || []).flatMap((m) => m.complements || []);
}

/** Reads a numeric column PostgREST may hand back as a string. */
function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
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
    // An accountant reading the package could not tell a PUE invoice from a
    // PPD one, and only a PPD invoice owes payment complements at all (#31).
    'Metodo Pago',
    'Cliente',
    'RFC Cliente',
    'Fecha Confirmacion',
    // How many complements this invoice has on file, so a PPD row with none
    // reads as a gap rather than as nothing to look for.
    'Complementos',
  ];

  const rows = (milestones || []).map((m) => [
    m.id,
    csvCell(m.label || ''),
    m.amount,
    m.status,
    m.due_date,
    m.tracking_reference || 'N/A',
    m.cfdi_id || 'N/A',
    m.cfdi_payment_method || 'N/A',
    csvCell(m.client_name || 'N/A'),
    m.client_rfc || 'N/A',
    m.confirmed_at || 'N/A',
    (m.complements || []).length,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * The payment complements, as their own sheet.
 *
 * Its own sheet rather than more columns on the invoice row, and rather than
 * extra rows in the invoice CSV, for one reason: **a complement is a payment,
 * not a sale.** Mixing them into the summary would make any column-sum of
 * `Monto` count the same money twice — once as the invoice and again as the
 * payment settling it. Separate sheets keep every total answering exactly one
 * question (#31).
 *
 * Cancelled complements are listed, with their status. Hiding them would make
 * a cancellation invisible to the person whose job is to account for it; the
 * ZIP only withholds the *files* for documents that were never stamped.
 */
export function generatePaymentComplementsCSV(
  organizationId: string,
  monthYear: string,
  milestones: MilestoneExportItem[]
): string {
  const headers = [
    'ID Complemento',
    'ID Cobro',
    'Folio Fiscal Complemento',
    'Folio Fiscal Factura',
    'Parcialidad',
    'Monto Pagado',
    'Saldo Anterior',
    'Saldo Insoluto',
    'Fecha Pago',
    'Num Operacion',
    'Estado',
    'Cliente',
    'RFC Cliente',
  ];

  const rows = allComplements(milestones).map((c) => [
    c.id,
    c.milestone_id,
    c.cfdi_uuid || 'N/A',
    c.invoice_cfdi_id || 'N/A',
    c.installment,
    c.amount,
    c.last_balance,
    c.remaining_balance,
    c.payment_date || 'N/A',
    c.operation_number || 'N/A',
    c.status,
    csvCell(c.client_name || 'N/A'),
    c.client_rfc || 'N/A',
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

  // Listed unconditionally, even when the month has no complements: a package
  // that silently omits the sheet is indistinguishable from one where nothing
  // was owed, and "nothing was owed" is the claim this feature must not make
  // on its own (#31).
  files.push({
    name: `Complementos_Pago_${monthYear}.csv`,
    type: 'text/csv',
    url: `/api/accountant/export?month=${monthYear}&format=complements`
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

    // Each complement is a separate stamped document with its own folio, and
    // for a PPD invoice it is the paperwork proving when the invoice was paid.
    // Only stamped ones get files: a complement with no folio fiscal never
    // reached the SAT, so there is no document to hand anyone (hard rule 1).
    (m.complements || []).forEach((c) => {
      if (!c.cfdi_uuid) return;
      const label = `${c.milestone_id}_P${c.installment}`;
      if (c.cfdi_xml_path) {
        files.push({
          name: `Complemento_${label}.xml`,
          type: 'application/xml',
          url: `/api/invoices/${c.milestone_id}/document?type=xml&complement=${c.id}`
        });
      }
      if (c.cfdi_pdf_path) {
        files.push({
          name: `Complemento_${label}.pdf`,
          type: 'application/pdf',
          url: `/api/invoices/${c.milestone_id}/document?type=pdf&complement=${c.id}`
        });
      }
    });
  });

  return {
    organizationId,
    month: monthYear,
    generatedAt: new Date().toISOString(),
    totalMilestonesCount: (milestones || []).length,
    totalAmount: (milestones || []).reduce((sum, m) => sum + (Number(m.amount) || 0), 0),
    // Kept out of `totalAmount` on purpose. A complement is a payment against
    // an invoice already counted there; adding it would report the same money
    // twice (#31). Two totals, two questions.
    totalComplementsCount: allComplements(milestones).length,
    totalComplementsAmount: allComplements(milestones).reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0
    ),
    filesCount: files.length,
    files
  };
}

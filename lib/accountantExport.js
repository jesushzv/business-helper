/**
 * 1-Click Accountant Export Package Engine — CommonJS JS
 */

function generateMonthlySummaryCSV(organizationId, monthYear, milestones) {
  const headers = ['ID', 'Concepto', 'Monto', 'Estado', 'Fecha Vencimiento', 'Clave Rastreo', 'CFDI ID'];
  const rows = (milestones || []).map((m) => [
    m.id,
    `"${(m.label || '').replace(/"/g, '""')}"`,
    m.amount,
    m.status,
    m.due_date,
    m.tracking_reference || 'N/A',
    m.cfdi_id || 'N/A'
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function buildAccountantZipManifest(organizationId, monthYear, milestones) {
  const files = [];

  files.push({
    name: `Resumen_Mensual_${monthYear}.csv`,
    type: 'text/csv',
    url: `/api/accountant/export?orgId=${organizationId}&month=${monthYear}&format=csv`
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
    filesCount: files.length,
    files
  };
}

module.exports = {
  generateMonthlySummaryCSV,
  buildAccountantZipManifest
};

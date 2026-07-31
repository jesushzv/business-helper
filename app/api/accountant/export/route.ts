import { NextResponse } from 'next/server';
import { generateMonthlySummaryCSV, buildAccountantZipManifest } from '@/lib/accountantExport';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId') || 'org-demo-1';
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

import { describe, it, expect } from 'vitest';
import {
  generateMonthlySummaryCSV,
  buildAccountantZipManifest,
  type MilestoneExportItem,
} from '@/lib/accountantExport';

const milestone: MilestoneExportItem = {
  id: 'm1',
  label: 'Anticipo',
  amount: 5000,
  due_date: '2026-08-15',
  status: 'confirmed',
  tracking_reference: 'SPEI12345',
  cfdi_id: 'FACT100',
  cfdi_xml_url: 'https://storage/m1.xml',
  cfdi_pdf_url: 'https://storage/m1.pdf',
  receipt_url: 'https://storage/m1.jpg',
};

describe('Monthly accountant CSV', () => {
  it('leads with the column titles a contador reconciles against', () => {
    const csv = generateMonthlySummaryCSV('org123', '2026-08', [milestone]);

    expect(csv.split('\n')[0]).toBe(
      'ID,Concepto,Monto,Estado,Fecha Vencimiento,Clave Rastreo,CFDI ID,Cliente,RFC Cliente,Fecha Confirmacion'
    );
  });

  it('writes the milestone amount and its SPEI tracking reference', () => {
    const csv = generateMonthlySummaryCSV('org123', '2026-08', [milestone]);

    expect(csv).toContain('5000');
    expect(csv).toContain('SPEI12345');
  });

  it('emits only the header when the month has no records', () => {
    expect(generateMonthlySummaryCSV('org123', '2026-08', []).split('\n')).toHaveLength(1);
  });
});

describe('Accountant ZIP manifest', () => {
  it('lists the CFDI XML, the PDF and the SPEI proof alongside the summary', () => {
    const manifest = buildAccountantZipManifest('org123', '2026-08', [milestone]);

    expect(manifest.month).toBe('2026-08');
    expect(manifest.files.map((f) => f.type)).toEqual([
      'text/csv',
      'application/xml',
      'application/pdf',
      'image/jpeg',
    ]);
  });
});

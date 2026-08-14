import { describe, it, expect } from 'vitest';
import {
  mapMilestoneRows,
  allComplements,
  generateMonthlySummaryCSV,
  generatePaymentComplementsCSV,
  buildAccountantZipManifest,
  type MilestoneRow,
} from '@/lib/accountantExport';

/**
 * #31 — the accountant export omitted complementos de pago.
 *
 * The export modelled one CFDI per milestone: `cfdi_id`, `cfdi_xml_url`,
 * `cfdi_pdf_url`. A PPD invoice's payment complements are *separate stamped
 * documents* with their own folios fiscales, and neither the rows nor the ZIP
 * manifest included them.
 *
 * The product sells this as "1-click, todo lo que tu contador necesita". For a
 * PPD invoice it handed the accountant the invoice and silently withheld the
 * documents proving when it was paid — which is the entire reason a payment
 * complement exists. The accountant then had to notice the gap and go to the
 * PAC portal, which is the workflow this feature replaces.
 */

/** A server-shaped row: PostgREST returns numeric(12,2) as a string. */
const PPD_ROW: MilestoneRow = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: '48720.00',
  due_date: '2026-08-10',
  status: 'confirmed',
  tracking_reference: 'SPEI-0001',
  cfdi_id: 'inv_abc',
  cfdi_xml_url: '/api/invoices/m-1/document?type=xml',
  cfdi_pdf_url: '/api/invoices/m-1/document?type=pdf',
  receipt_url: null,
  cfdi_payment_method: 'PPD',
  confirmed_at: '2026-08-11T12:00:00.000Z',
  contracts: { title: 'Contrato', clients: { name: 'Constructora Maya', rfc: 'CMA120315HD9' } },
  cfdi_payment_complements: [
    // Deliberately out of order: SAT numbering is sequential per document and
    // an accountant reads them that way, so the mapping must sort.
    {
      id: 'c-2',
      installment: '2',
      amount: '28720.00',
      last_balance: '28720.00',
      remaining_balance: '0.00',
      payment_date: '2026-08-25T10:00:00.000Z',
      operation_number: 'SPEI-0002',
      status: 'issued',
      cfdi_uuid: 'UUID-COMP-2',
      cfdi_xml_path: 'org-1/comp-2.xml',
      cfdi_pdf_path: 'org-1/comp-2.pdf',
    },
    {
      id: 'c-1',
      installment: '1',
      amount: '20000.00',
      last_balance: '48720.00',
      remaining_balance: '28720.00',
      payment_date: '2026-08-11T12:00:00.000Z',
      operation_number: 'SPEI-0001',
      status: 'issued',
      cfdi_uuid: 'UUID-COMP-1',
      cfdi_xml_path: 'org-1/comp-1.xml',
      cfdi_pdf_path: 'org-1/comp-1.pdf',
    },
  ],
};

describe('complements survive the flattening (#31, #78)', () => {
  it('carries them off a server-shaped row, in parcialidad order', () => {
    const [item] = mapMilestoneRows([PPD_ROW]);

    expect(item.complements).toHaveLength(2);
    expect(item.complements?.map((c) => c.installment)).toEqual([1, 2]);
    // numeric(12,2) arrives as a string; a string here would break every sum.
    expect(item.complements?.[0].amount).toBe(20000);
    expect(item.complements?.[0].remaining_balance).toBe(28720);
    // The payer travels with each row so the sheet stands on its own.
    expect(item.complements?.[0].client_rfc).toBe('CMA120315HD9');
    // …and the folio of the invoice being settled, which is not the
    // complement's own folio.
    expect(item.complements?.[0].invoice_cfdi_id).toBe('inv_abc');
    expect(item.complements?.[0].cfdi_uuid).toBe('UUID-COMP-1');
    expect(item.cfdi_payment_method).toBe('PPD');
  });

  it('a milestone with no complements gets an empty list, not undefined', () => {
    const [item] = mapMilestoneRows([{ ...PPD_ROW, cfdi_payment_complements: null }]);
    expect(item.complements).toEqual([]);
    expect(allComplements([item])).toEqual([]);
  });
});

describe('the complements sheet (#31)', () => {
  it('lists each complement with the balances the SAT reconciles against', () => {
    const milestones = mapMilestoneRows([PPD_ROW]);
    const csv = generatePaymentComplementsCSV('org-1', '2026-08', milestones);
    const [header, first, second] = csv.split('\n');

    expect(header).toBe(
      'ID Complemento,ID Cobro,Folio Fiscal Complemento,Folio Fiscal Factura,Parcialidad,' +
        'Monto Pagado,Saldo Anterior,Saldo Insoluto,Fecha Pago,Num Operacion,Estado,' +
        'Cliente,RFC Cliente'
    );
    expect(first).toContain('UUID-COMP-1');
    expect(first).toContain('20000');
    expect(first).toContain('28720');
    expect(second).toContain('UUID-COMP-2');
  });

  it('is its own sheet so no total counts the same money twice', () => {
    const milestones = mapMilestoneRows([PPD_ROW]);
    const summary = generateMonthlySummaryCSV('org-1', '2026-08', milestones);

    // The invoice sheet carries the invoice's amount once and no payment rows.
    expect(summary.split('\n')).toHaveLength(2);
    expect(summary).not.toContain('UUID-COMP-1');
    // It does say how many complements exist, so a PPD invoice with none reads
    // as a gap rather than as nothing to look for.
    expect(summary).toContain('PPD');
    expect(summary.split('\n')[1].endsWith(',2')).toBe(true);
  });

  it('lists a cancelled complement rather than hiding it', () => {
    // Hiding a cancellation from the person whose job is to account for it is
    // the wrong kind of tidy. The ZIP withholds the *file* for anything never
    // stamped; the sheet withholds nothing.
    const cancelled = mapMilestoneRows([
      {
        ...PPD_ROW,
        cfdi_payment_complements: [
          {
            ...PPD_ROW.cfdi_payment_complements![1],
            status: 'cancelled',
          },
        ],
      },
    ]);

    const csv = generatePaymentComplementsCSV('org-1', '2026-08', cancelled);
    expect(csv).toContain('cancelled');
    expect(csv).toContain('UUID-COMP-1');
  });
});

describe('the ZIP manifest carries the complement documents (#31)', () => {
  it('points each one at the download route with its complement id', () => {
    const milestones = mapMilestoneRows([PPD_ROW]);
    const manifest = buildAccountantZipManifest('org-1', '2026-08', milestones);
    const names = manifest.files.map((f) => f.name);

    expect(names).toContain('Complemento_m-1_P1.xml');
    expect(names).toContain('Complemento_m-1_P2.pdf');

    const xml = manifest.files.find((f) => f.name === 'Complemento_m-1_P1.xml');
    // Served through the app's authenticated route, keyed by BOTH the
    // milestone and the complement — the route scopes one against the other.
    expect(xml?.url).toBe('/api/invoices/m-1/document?type=xml&complement=c-1');
    expect(xml?.type).toBe('application/xml');

    // Never a literal storage host: the pre-#31 export's own defect class.
    expect(manifest.files.every((f) => !f.url.includes('storage.businesshelper'))).toBe(true);
  });

  it('offers no file for a complement that was never stamped', () => {
    // Absent is absent (hard rule 1): a complement with no folio fiscal never
    // reached the SAT, so there is no document to hand anyone.
    const unstamped = mapMilestoneRows([
      {
        ...PPD_ROW,
        cfdi_payment_complements: [
          {
            ...PPD_ROW.cfdi_payment_complements![1],
            status: 'failed',
            cfdi_uuid: null,
            cfdi_xml_path: null,
            cfdi_pdf_path: null,
          },
        ],
      },
    ]);

    const manifest = buildAccountantZipManifest('org-1', '2026-08', unstamped);
    expect(manifest.files.some((f) => f.name.startsWith('Complemento_'))).toBe(false);
    // But it is still counted and still on the sheet, so the accountant can
    // see that a payment was recorded without a document behind it.
    expect(manifest.totalComplementsCount).toBe(1);
  });

  it('keeps the payment total out of the invoice total', () => {
    const milestones = mapMilestoneRows([PPD_ROW]);
    const manifest = buildAccountantZipManifest('org-1', '2026-08', milestones);

    // The invoice, once.
    expect(manifest.totalAmount).toBe(48720);
    // The payments settling it, reported separately — 20,000 + 28,720 happens
    // to equal the invoice, which is exactly why summing them together would
    // have read as $97,440 of business that did not happen.
    expect(manifest.totalComplementsCount).toBe(2);
    expect(manifest.totalComplementsAmount).toBe(48720);
  });

  it('always lists the complements sheet, even for a month with none', () => {
    const none = mapMilestoneRows([{ ...PPD_ROW, cfdi_payment_complements: [] }]);
    const manifest = buildAccountantZipManifest('org-1', '2026-08', none);

    const sheet = manifest.files.find((f) => f.name === 'Complementos_Pago_2026-08.csv');
    expect(sheet?.url).toBe('/api/accountant/export?month=2026-08&format=complements');
    // No tenant id in the link: the export is scoped to the caller's session,
    // and an orgId in the query string was how it used to be redirected.
    expect(sheet?.url).not.toContain('org');
  });
});

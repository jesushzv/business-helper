'use client';

import { useState, useCallback } from 'react';
import { simulateInvoiceStamping } from '@/lib/facturapi';
import { generateMonthlySummaryCSV, buildAccountantZipManifest } from '@/lib/accountantExport';

export interface InvoiceItem {
  id: string;
  milestoneId: string;
  clientName: string;
  clientRfc: string;
  concept: string;
  amount: number;
  dueDate: string;
  cfdiStatus: 'none' | 'pending' | 'issued' | 'failed';
  cfdiId?: string | null;
  xmlUrl?: string | null;
  pdfUrl?: string | null;
}

const INITIAL_INVOICES: InvoiceItem[] = [
  {
    id: 'inv-1',
    milestoneId: 'm-101',
    clientName: 'Construcciones Maya S.A. de C.V.',
    clientRfc: 'CMA120315HD9',
    concept: 'Anticipo 50% Proyecto Torre Norte',
    amount: 75000,
    dueDate: '2026-08-15',
    cfdiStatus: 'issued',
    cfdiId: 'cfdi_889123_abc',
    xmlUrl: 'https://storage.businesshelper.mx/cfdi/cfdi_889123_abc.xml',
    pdfUrl: 'https://storage.businesshelper.mx/cfdi/cfdi_889123_abc.pdf'
  },
  {
    id: 'inv-2',
    milestoneId: 'm-102',
    clientName: 'Desarrollos Inmobiliarios del Norte',
    clientRfc: 'DIN080920AB3',
    concept: 'Pago Finiquito Servicios de Ingenieria',
    amount: 45000,
    dueDate: '2026-08-20',
    cfdiStatus: 'none',
    cfdiId: null,
    xmlUrl: null,
    pdfUrl: null
  },
  {
    id: 'inv-3',
    milestoneId: 'm-103',
    clientName: 'Taller Industrial Regiomontano',
    clientRfc: 'GORR750412890',
    concept: 'Mantenimiento Preventivo Mensual',
    amount: 18000,
    dueDate: '2026-08-28',
    cfdiStatus: 'pending',
    cfdiId: null,
    xmlUrl: null,
    pdfUrl: null
  }
];

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>(INITIAL_INVOICES);
  const [stamping, setStamping] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  const stampCFDI = useCallback((milestoneId: string) => {
    setStamping(true);
    try {
      const stampResult = simulateInvoiceStamping(milestoneId);
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.milestoneId === milestoneId
            ? {
                ...inv,
                cfdiStatus: 'issued',
                cfdiId: stampResult.cfdiId,
                xmlUrl: stampResult.xmlUrl,
                pdfUrl: stampResult.pdfUrl
              }
            : inv
        )
      );
      return { success: true, stampResult };
    } catch {
      return { success: false, error: 'Error al timbrar factura con Facturapi' };
    } finally {
      setStamping(false);
    }
  }, []);

  const downloadAccountantPackage = useCallback((monthYear: string = '2026-08') => {
    setExporting(true);
    try {
      const exportMilestones = invoices.map((inv) => ({
        id: inv.milestoneId,
        label: inv.concept,
        amount: inv.amount,
        due_date: inv.dueDate,
        status: 'confirmed',
        cfdi_id: inv.cfdiId,
        cfdi_xml_url: inv.xmlUrl,
        cfdi_pdf_url: inv.pdfUrl
      }));

      const csvContent = generateMonthlySummaryCSV('org-demo-1', monthYear, exportMilestones);
      const manifest = buildAccountantZipManifest('org-demo-1', monthYear, exportMilestones);

      // Trigger client-side CSV download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Paquete_Contador_${monthYear}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return { success: true, manifest, csvContent };
    } catch {
      return { success: false, error: 'Error al generar paquete para contador' };
    } finally {
      setExporting(false);
    }
  }, [invoices]);

  return {
    invoices,
    stamping,
    exporting,
    stampCFDI,
    downloadAccountantPackage
  };
}

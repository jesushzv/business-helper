'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Invoicing state for the facturación screen.
 *
 * The list here was three hardcoded invoices — one of them already carrying a
 * `cfdi_889123_abc` id and two storage.businesshelper.mx URLs — and "timbrar"
 * called `simulateInvoiceStamping` in the browser, so the badge flipped to
 * "CFDI Emitido" without anything leaving the page. Every part of that was
 * fiction, including for a user who had genuinely invoiced nothing.
 *
 * It now reads the organization's own milestones and stamps through
 * `/api/invoices/issue`, which contacts a PAC. A failure is surfaced as a
 * failure; there is no local state change that fakes success.
 */

export type CFDIStatus = 'none' | 'pending' | 'issued' | 'failed' | 'cancelled';

export interface InvoiceItem {
  id: string;
  milestoneId: string;
  clientName: string;
  clientRfc: string | null;
  clientPhone: string | null;
  concept: string;
  amount: number;
  dueDate: string;
  cfdiStatus: CFDIStatus;
  cfdiUuid: string | null;
  /** 'sandbox' documents come from a PAC test account and have no fiscal validity. */
  cfdiEnvironment: 'sandbox' | 'live' | null;
  cfdiError: string | null;
  xmlUrl: string | null;
  pdfUrl: string | null;
}

/** Shape of a milestone row as `/api/receivables` returns it. */
interface ReceivableRow {
  id: string;
  label: string;
  amount: number | string;
  due_date: string;
  cfdi_status?: CFDIStatus | null;
  cfdi_uuid?: string | null;
  cfdi_environment?: 'sandbox' | 'live' | null;
  cfdi_error?: string | null;
  cfdi_xml_url?: string | null;
  cfdi_pdf_url?: string | null;
  contracts?: {
    title?: string | null;
    clients?: { name?: string | null; rfc?: string | null; phone?: string | null } | null;
  } | null;
}

function toInvoiceItem(row: ReceivableRow): InvoiceItem {
  const client = row.contracts?.clients;

  return {
    id: row.id,
    milestoneId: row.id,
    clientName: client?.name || 'Cliente sin nombre',
    clientRfc: client?.rfc || null,
    clientPhone: client?.phone || null,
    concept: row.contracts?.title ? `${row.contracts.title} — ${row.label}` : row.label,
    amount: typeof row.amount === 'string' ? Number(row.amount) : row.amount,
    dueDate: row.due_date,
    cfdiStatus: row.cfdi_status || 'none',
    cfdiUuid: row.cfdi_uuid || null,
    cfdiEnvironment: row.cfdi_environment || null,
    cfdiError: row.cfdi_error || null,
    xmlUrl: row.cfdi_xml_url || null,
    pdfUrl: row.cfdi_pdf_url || null,
  };
}

export interface StampOutcome {
  success: boolean;
  uuid?: string;
  environment?: 'sandbox' | 'live';
  warning?: string | null;
  error?: string;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  const loadInvoices = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/receivables');
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setLoadError(data?.error?.message || 'No se pudieron cargar tus cobros');
        return;
      }

      setInvoices((data?.receivables || []).map(toInvoiceItem));
    } catch {
      setLoadError('No se pudieron cargar tus cobros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  /**
   * Stamps a milestone through the organization's PAC.
   *
   * The row is refreshed from the response rather than assumed: the folio
   * fiscal, the environment and any warning about the stored copies all come
   * from what the PAC actually returned.
   */
  const stampCFDI = useCallback(async (milestoneId: string): Promise<StampOutcome> => {
    setStampingId(milestoneId);
    try {
      const res = await fetch('/api/invoices/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message = data?.error?.message || 'No se pudo timbrar la factura';
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.milestoneId === milestoneId
              ? { ...inv, cfdiStatus: 'failed', cfdiError: message }
              : inv
          )
        );
        return { success: false, error: message };
      }

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.milestoneId === milestoneId
            ? {
                ...inv,
                cfdiStatus: 'issued',
                cfdiUuid: data.uuid,
                cfdiEnvironment: data.environment,
                cfdiError: data.warning || null,
                xmlUrl: data.xmlUrl,
                pdfUrl: data.pdfUrl,
              }
            : inv
        )
      );

      return {
        success: true,
        uuid: data.uuid,
        environment: data.environment,
        warning: data.warning,
      };
    } catch {
      return { success: false, error: 'No se pudo conectar con el servicio de facturación' };
    } finally {
      setStampingId(null);
    }
  }, []);

  /**
   * Downloads the accountant package.
   *
   * This used to build the CSV in the browser from the demo invoices above, so
   * the file an accountant received described transactions that only existed in
   * this component's state. It now downloads what `/api/accountant/export`
   * produces from the organization's own milestones.
   */
  const downloadAccountantPackage = useCallback(async (monthYear: string = new Date().toISOString().slice(0, 7)) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/accountant/export?month=${monthYear}&format=csv`);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return {
          success: false,
          error: data?.error?.message || 'Error al generar paquete para contador',
        };
      }

      const csvContent = await res.text();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Paquete_Contador_${monthYear}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true, csvContent };
    } catch {
      return { success: false, error: 'Error al generar paquete para contador' };
    } finally {
      setExporting(false);
    }
  }, []);

  return {
    invoices,
    loading,
    loadError,
    stampingId,
    exporting,
    reload: loadInvoices,
    stampCFDI,
    downloadAccountantPackage
  };
}

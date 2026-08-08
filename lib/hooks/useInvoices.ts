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

/**
 * SAT MetodoPago.
 *
 * PUE (pago en una sola exhibición) declares the invoice as already paid. PPD
 * (pago en parcialidades o diferido) declares that it is not, and obliges the
 * taxpayer to file a complemento de pago for every payment received afterwards.
 * The product could stamp PPD before it could file those complements, so the
 * choice was deliberately not exposed here; it is now.
 */
export type CFDIPaymentMethod = 'PUE' | 'PPD';

export type ComplementStatus = 'pending' | 'issued' | 'failed' | 'cancelled';

export interface PaymentComplement {
  id: string;
  installment: number;
  amount: number;
  remainingBalance: number;
  status: ComplementStatus;
  uuid: string | null;
  paymentDate: string | null;
  error: string | null;
  xmlUrl: string | null;
  pdfUrl: string | null;
}

export interface InvoiceItem {
  id: string;
  milestoneId: string;
  /**
   * The quote's `public_token`, for the `/pay/` link the WhatsApp aviso carries.
   *
   * Deliberately not `milestoneId`: the aviso used to build `/pay/${milestoneId}`,
   * which the route resolves as a quote token and therefore never finds (#72).
   * `null` when the contract has no quote — the aviso is disabled rather than
   * sent with a dead link.
   */
  publicToken: string | null;
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
  /** What the CFDI was stamped as. Anything stamped before the column existed reads as PUE. */
  paymentMethod: CFDIPaymentMethod;
  /** Complementos de pago filed against this invoice, oldest parcialidad first. */
  complements: PaymentComplement[];
  /** What the PPD invoice still owes, in pesos. 0 once it is settled. */
  outstandingBalance: number;
}

/** Shape of a complement row as `/api/receivables` embeds it. */
interface ComplementRow {
  id: string;
  installment: number;
  amount: number | string;
  last_balance?: number | string | null;
  remaining_balance: number | string;
  status: ComplementStatus;
  cfdi_uuid?: string | null;
  cfdi_xml_path?: string | null;
  cfdi_pdf_path?: string | null;
  payment_date?: string | null;
  error?: string | null;
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
  cfdi_payment_method?: CFDIPaymentMethod | null;
  cfdi_total?: number | string | null;
  cfdi_payment_complements?: ComplementRow[] | null;
  contracts?: {
    title?: string | null;
    clients?: { name?: string | null; rfc?: string | null; phone?: string | null } | null;
    /** Embedded through `contracts.quote_id`; carries the token `/pay/` resolves. */
    quotes?: { public_token?: string | null } | { public_token?: string | null }[] | null;
  } | null;
}

/** Unwraps a PostgREST to-one embed that may arrive as an object or a 1-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(parsed) ? (parsed as number) : 0;
}

function toInvoiceItem(row: ReceivableRow): InvoiceItem {
  const client = row.contracts?.clients;
  const milestoneId = row.id;

  const complements = (row.cfdi_payment_complements || [])
    .slice()
    .sort((a, b) => a.installment - b.installment)
    .map((c) => ({
      id: c.id,
      installment: c.installment,
      amount: toNumber(c.amount),
      remainingBalance: toNumber(c.remaining_balance),
      status: c.status,
      uuid: c.cfdi_uuid || null,
      paymentDate: c.payment_date || null,
      error: c.error || null,
      // Paths, not URLs, are what the row stores; the download route signs a
      // short-lived link per request.
      xmlUrl: c.cfdi_xml_path
        ? `/api/invoices/${milestoneId}/document?type=xml&complement=${c.id}`
        : null,
      pdfUrl: c.cfdi_pdf_path
        ? `/api/invoices/${milestoneId}/document?type=pdf&complement=${c.id}`
        : null,
    }));

  const total = toNumber(row.cfdi_total) > 0 ? toNumber(row.cfdi_total) : toNumber(row.amount);
  const paid = complements
    .filter((c) => c.status === 'issued')
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    id: row.id,
    milestoneId,
    publicToken: firstOf(row.contracts?.quotes)?.public_token || null,
    clientName: client?.name || 'Cliente sin nombre',
    clientRfc: client?.rfc || null,
    clientPhone: client?.phone || null,
    concept: row.contracts?.title ? `${row.contracts.title} — ${row.label}` : row.label,
    amount: toNumber(row.amount),
    dueDate: row.due_date,
    cfdiStatus: row.cfdi_status || 'none',
    cfdiUuid: row.cfdi_uuid || null,
    cfdiEnvironment: row.cfdi_environment || null,
    cfdiError: row.cfdi_error || null,
    xmlUrl: row.cfdi_xml_url || null,
    pdfUrl: row.cfdi_pdf_url || null,
    paymentMethod: row.cfdi_payment_method === 'PPD' ? 'PPD' : 'PUE',
    complements,
    outstandingBalance: Math.max(Math.round((total - paid) * 100) / 100, 0),
  };
}

export interface StampOutcome {
  success: boolean;
  uuid?: string;
  environment?: 'sandbox' | 'live';
  warning?: string | null;
  error?: string;
  /** True for a PPD document: every payment against it owes a complemento de pago. */
  complementRequired?: boolean;
}

export interface ComplementOutcome {
  success: boolean;
  issued?: boolean;
  uuid?: string;
  installment?: number;
  remainingBalance?: number;
  environment?: 'sandbox' | 'live';
  warning?: string | null;
  message?: string;
  error?: string;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [complementingId, setComplementingId] = useState<string | null>(null);
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
  const stampCFDI = useCallback(async (
    milestoneId: string,
    paymentMethod: CFDIPaymentMethod = 'PUE'
  ): Promise<StampOutcome> => {
    setStampingId(milestoneId);
    try {
      const res = await fetch('/api/invoices/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId, paymentMethod }),
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
                paymentMethod: data.paymentMethod === 'PPD' ? 'PPD' : 'PUE',
              }
            : inv
        )
      );

      return {
        success: true,
        uuid: data.uuid,
        environment: data.environment,
        warning: data.warning,
        complementRequired: Boolean(data.complementRequired),
      };
    } catch {
      return { success: false, error: 'No se pudo conectar con el servicio de facturación' };
    } finally {
      setStampingId(null);
    }
  }, []);

  /**
   * Files a complemento de pago against a PPD invoice.
   *
   * The ordinary path is automatic — `/api/receivables/[id]/confirm` files one
   * as soon as a payment is confirmed. This is the manual path: a complement
   * whose stamping failed, or a payment reconciled outside the app. Either way
   * the SAT is owed the document, so the list is reloaded from the server
   * afterwards rather than patched locally: the parcialidad and the outstanding
   * balance are the server's arithmetic, not this component's.
   */
  const sendComplement = useCallback(
    async (milestoneId: string, amount?: number): Promise<ComplementOutcome> => {
      setComplementingId(milestoneId);
      try {
        const res = await fetch(`/api/invoices/${milestoneId}/complement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(amount !== undefined ? { amount } : {}),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          return {
            success: false,
            error: data?.error?.message || 'No se pudo emitir el complemento de pago',
          };
        }

        await loadInvoices();

        if (!data?.issued) {
          return { success: true, issued: false, message: data?.message };
        }

        return {
          success: true,
          issued: true,
          uuid: data.uuid,
          installment: data.installment,
          remainingBalance: data.remainingBalance,
          environment: data.environment,
          warning: data.warning,
        };
      } catch {
        return { success: false, error: 'No se pudo conectar con el servicio de facturación' };
      } finally {
        setComplementingId(null);
      }
    },
    [loadInvoices]
  );

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
    complementingId,
    exporting,
    reload: loadInvoices,
    stampCFDI,
    sendComplement,
    downloadAccountantPackage
  };
}

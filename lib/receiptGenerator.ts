/**
 * Business Helper — Nota de Venta & Zero-SAT Recibo de Pago Engine
 * 
 * Provides zero-SAT-friction receipt generation for quotes, payments, and milestone
 * receivables with tenant branding, tax breakdown, and 1-tap WhatsApp sharing.
 */

import { generateWhatsAppLink } from './whatsappLink';

export interface NotaDeVentaLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface NotaDeVentaParams {
  title?: string;
  milestoneLabel?: string;
  clientName?: string;
  client_name?: string;
  clientRfc?: string;
  client_rfc?: string;
  amount?: number;
  subtotal?: number;
  /**
   * An IVA-**inclusive** figure, for callers whose money is already gross.
   *
   * `amount`/`subtotal` are pre-tax and get 16% added on top. A milestone is a
   * slice of `quotes.total_amount` and is therefore already gross, so passing
   * one as `amount` sent the client a comprobante 16% above the cobro — the
   * $48,720 anticipo went out as $56,515.20, matching neither the /pay page nor
   * the CFDI for the same milestone (#251). Given this, the base is recovered
   * from the total (as `lib/facturapi.ts` does with `baseRatio`) and the
   * printed total is exactly the figure passed in — no rounding drift.
   */
  totalIncludingIva?: number;
  includeIva?: boolean;
  lineItems?: NotaDeVentaLineItem[];
  folio?: string;
  date?: string;
  status?: string;
  paymentMethod?: string;
  /**
   * Whether the money has actually been received.
   *
   * Defaults to **false**, and deliberately: this file used to default the
   * status to `'PAGADO'` and the WhatsApp copy to "¡Muchas gracias por tu
   * pago!" for every caller, so a `pending` cobro nobody had paid was sent to
   * the tenant's own client as a "Comprobante de Pago" (#252). A payment is
   * something a caller states, not something a document assumes.
   */
  paid?: boolean;
}

export interface TenantBrandingOrg {
  name?: string;
  rfc?: string;
  logo_url?: string;
  logoUrl?: string;
}

export interface NotaDeVentaPayload {
  folio: string;
  date: string;
  tenant: {
    name: string;
    rfc: string;
    logoUrl: string;
  };
  client: {
    name: string;
    rfc: string;
  };
  title: string;
  lineItems: NotaDeVentaLineItem[];
  subtotal: number;
  ivaAmount: number;
  total: number;
  formattedSubtotal: string;
  formattedIva: string;
  formattedTotal: string;
  status: string;
  paymentMethod: string;
  notes: string;
  /** What the copy below is allowed to claim. */
  paid: boolean;
}

/** Money as the client reads it: two decimals, no floating-point tail. */
const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

/**
 * Generates a structured Nota de Venta / Recibo de Pago payload.
 */
export function generateNotaDeVentaPayload(
  data: NotaDeVentaParams,
  tenantOrg?: TenantBrandingOrg
): NotaDeVentaPayload {
  const orgName = tenantOrg?.name || 'Mi Empresa';
  // Absent is absent (#179): XAXX010101000 is *público en general* — printing
  // it for a tenant or client whose RFC is simply not on file records an
  // identity nobody established. Consumers render the RFC line only when set.
  const orgRfc = tenantOrg?.rfc || '';
  const orgLogo = tenantOrg?.logo_url || tenantOrg?.logoUrl || '/logo.svg';

  const clientName = data?.clientName || data?.client_name || 'Cliente General';
  const clientRfc = data?.clientRfc || data?.client_rfc || '';

  const title = data?.title || data?.milestoneLabel || 'Nota de Venta / Recibo de Pago';
  const paid = data?.paid === true;

  // SAT Tax Calculations (IVA 16%)
  const hasIva = data?.includeIva !== false;

  // Two ways in, one arithmetic. `totalIncludingIva` is a gross figure and the
  // base is recovered from it, so the printed total is the caller's number to
  // the centavo; `amount`/`subtotal` are pre-tax and IVA is added on top.
  const grossInput = Number(data?.totalIncludingIva);
  const fromGross = Number.isFinite(grossInput) && grossInput > 0;

  const preTax = Number(data?.subtotal || data?.amount || 0);
  const total = fromGross ? money(grossInput) : money(preTax * (hasIva ? 1.16 : 1));
  const rawSubtotal = fromGross ? money(hasIva ? total / 1.16 : total) : preTax;
  const ivaAmount = money(total - rawSubtotal);

  const formattedSubtotal = rawSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedIva = ivaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedTotal = total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineItems = Array.isArray(data?.lineItems) && data.lineItems.length > 0
    ? data.lineItems
    : [{ description: title, quantity: 1, unitPrice: rawSubtotal, total: rawSubtotal }];

  const folio = data?.folio || `NV-${Date.now().toString().slice(-6)}`;
  const dateStr = data?.date || new Date().toISOString().split('T')[0];

  return {
    folio,
    date: dateStr,
    tenant: {
      name: orgName,
      rfc: orgRfc,
      logoUrl: orgLogo,
    },
    client: {
      name: clientName,
      rfc: clientRfc,
    },
    title,
    lineItems,
    subtotal: rawSubtotal,
    ivaAmount,
    total,
    formattedSubtotal: `$${formattedSubtotal} MXN`,
    formattedIva: `$${formattedIva} MXN`,
    formattedTotal: `$${formattedTotal} MXN`,
    status: data?.status || (paid ? 'PAGADO' : 'PENDIENTE DE PAGO'),
    paymentMethod: data?.paymentMethod || 'Transferencia SPEI',
    notes: paid
      ? 'Gracias por su preferencia. Este documento es un comprobante de pago comercial (Nota de Venta).'
      : 'Gracias por su preferencia. Este documento detalla un cobro pendiente; no es un comprobante de pago.',
    paid,
  };
}

/**
 * Generates a status-aware WhatsApp click-to-chat link containing the receipt summary.
 */
export function generateReceiptWhatsAppLink(receiptPayload: NotaDeVentaPayload, phone?: string | null): string {
  const { folio, client, title, formattedTotal, tenant, paid } = receiptPayload;

  // Two messages, because there are two facts. Thanking a client for a payment
  // they have not made — which this said for every cobro, paid or not — is the
  // fabricated-success rule pointed at the tenant's own customer (#252).
  const text = paid
    ? `Hola ${client.name}, te enviamos tu Nota de Venta / Comprobante de Pago (${folio}) correspondiente a "${title}" por ${formattedTotal}. ¡Muchas gracias por tu pago a ${tenant.name}!`
    : `Hola ${client.name}, te enviamos tu Nota de Venta (${folio}) correspondiente a "${title}" por ${formattedTotal}. Queda pendiente de pago; en cuanto recibamos tu transferencia te enviamos el comprobante. Gracias, ${tenant.name}.`;

  return generateWhatsAppLink(phone || '', text);
}

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
  includeIva?: boolean;
  lineItems?: NotaDeVentaLineItem[];
  folio?: string;
  date?: string;
  status?: string;
  paymentMethod?: string;
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
}

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
  const rawSubtotal = Number(data?.subtotal || data?.amount || 0);

  // SAT Tax Calculations (IVA 16%)
  const hasIva = data?.includeIva !== false;
  const ivaAmount = hasIva ? rawSubtotal * 0.16 : 0;
  const total = rawSubtotal + ivaAmount;

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
    status: data?.status || 'PAGADO',
    paymentMethod: data?.paymentMethod || 'Transferencia SPEI',
    notes: 'Gracias por su preferencia. Este documento es un comprobante de pago comercial (Nota de Venta).',
  };
}

/**
 * Generates a status-aware WhatsApp click-to-chat link containing the receipt summary.
 */
export function generateReceiptWhatsAppLink(receiptPayload: NotaDeVentaPayload, phone?: string | null): string {
  const { folio, client, title, formattedTotal, tenant } = receiptPayload;

  const text = `Hola ${client.name}, te enviamos tu Nota de Venta / Comprobante de Pago (${folio}) correspondiente a "${title}" por ${formattedTotal}. ¡Muchas gracias por tu pago a ${tenant.name}!`;

  return generateWhatsAppLink(phone || '', text);
}

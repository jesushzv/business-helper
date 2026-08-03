/**
 * Business Helper — Nota de Venta & Recibo de Pago Engine (CommonJS Export)
 * Zero-SAT-friction invoice & payment receipt generator.
 */

const { generateWhatsAppLink } = require('./whatsappLink.js');

/**
 * Generates a structured Nota de Venta / Recibo de Pago payload.
 */
function generateNotaDeVentaPayload(data, tenantOrg) {
  const orgName = tenantOrg?.name || 'Mi Empresa';
  const orgRfc = tenantOrg?.rfc || 'XAXX010101000';
  const orgLogo = tenantOrg?.logo_url || '/logo.svg';

  const clientName = data?.clientName || data?.client_name || 'Cliente General';
  const clientRfc = data?.clientRfc || data?.client_rfc || 'XAXX010101000';

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
function generateReceiptWhatsAppLink(receiptPayload, phone) {
  const { folio, client, title, formattedTotal, tenant } = receiptPayload;

  const text = `Hola ${client.name}, te enviamos tu Nota de Venta / Comprobante de Pago (${folio}) correspondiente a "${title}" por ${formattedTotal}. ¡Muchas gracias por tu pago a ${tenant.name}!`;

  return generateWhatsAppLink(phone || '', text);
}

module.exports = {
  generateNotaDeVentaPayload,
  generateReceiptWhatsAppLink,
};

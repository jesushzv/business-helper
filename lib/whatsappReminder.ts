/**
 * Business Helper — Automated WhatsApp Payment Reminders
 */

import { generateWhatsAppLink } from './whatsappLink';
import { getAppBaseUrl, getPaymentPublicUrl } from './url';
import { formatDateOnlyEs } from './dates';

export interface PaymentReminderParams {
  phone: string;
  clientName: string;
  milestoneLabel: string;
  amount: number;
  dueDate: string;
  status?: 'upcoming_3d' | 'due_today' | 'overdue' | string;
  /**
   * The quote's `public_token`. Absent means there is no payment page to send
   * them to, so the caller should not be building a reminder at all — see the
   * note in generatePaymentReminderLink.
   */
  payToken?: string;
  baseUrl?: string;
}

/**
 * Formats a status-aware WhatsApp payment reminder Click-to-Chat link.
 */
export function generatePaymentReminderLink(params: PaymentReminderParams): string {
  const {
    phone,
    clientName = 'Cliente',
    milestoneLabel = 'Pago',
    amount = 0,
    dueDate = '',
    status = 'due_today',
    payToken = '',
    // Was 'https://business-helper.vercel.app' — a preview host, not the
    // product domain (#73). #73 listed two builders; this was a third.
    baseUrl,
  } = params;

  const formattedAmount = Number(amount).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Without a token there is no payment page, so the message links to the app
  // root rather than to /pay/<nothing>. Callers are expected not to offer the
  // reminder at all in that case; this is the last line of defence, not the
  // intended path.
  const resolvedBase = baseUrl ? baseUrl.replace(/\/+$/, '') : getAppBaseUrl();
  const payUrl = payToken
    ? baseUrl
      ? `${resolvedBase}/pay/${payToken}`
      : getPaymentPublicUrl(payToken)
    : resolvedBase;

  let text = '';

  if (status === 'overdue') {
    text = `Hola ${clientName}, esperamos te encuentres muy bien. Te recordamos amablemente que el pago de "${milestoneLabel}" por $${formattedAmount} MXN está atrasado (vencido el ${formatDateOnlyEs(dueDate)}). Te compartimos la liga para subir tu comprobante SPEI: ${payUrl}. ¡Muchas gracias!`;
  } else if (status === 'due_today') {
    text = `Hola ${clientName}, hoy vence el pago correspondiente a "${milestoneLabel}" por $${formattedAmount} MXN. Puedes realizar tu transferencia SPEI y adjuntar tu comprobante aquí: ${payUrl}. Saludos cordiales.`;
  } else {
    // upcoming_3d or default
    text = `Hola ${clientName}, te recordamos que el pago de "${milestoneLabel}" por $${formattedAmount} MXN vence el ${formatDateOnlyEs(dueDate)}. Te compartimos los datos bancarios y liga para subir tu comprobante SPEI: ${payUrl}. ¡Saludos!`;
  }

  return generateWhatsAppLink(phone, text);
}

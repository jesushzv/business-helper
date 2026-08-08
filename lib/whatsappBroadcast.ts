/**
 * Outbound Automated WhatsApp Reminder Broadcast Engine — Business Helper
 * 
 * Generates status-aware payment reminder broadcast payloads for upcoming,
 * due-date, and overdue milestone receivables.
 */

import { getPaymentPublicUrl } from './url';

export interface BroadcastMilestone {
  id: string;
  /**
   * The quote's `public_token`, which is what `/pay/[token]` resolves.
   *
   * Separate from `id` on purpose. This function used to build the URL from
   * `milestone.id`, and because both are strings the substitution was invisible
   * at the call site — the message sent fine and only the client saw the 404
   * (#72). A distinct, required field makes the wrong value a type error.
   *
   * `null` when the milestone's contract has no quote behind it: there is no
   * payment page for it, and `paymentUrl` is then null rather than a guess.
   */
  publicToken: string | null;
  label: string;
  amount: number;
  due_date: string;
  status: string;
}

export interface BroadcastClient {
  name: string;
  phone?: string | null;
}

export function generateReminderBroadcastPayload(
  milestone: BroadcastMilestone,
  client: BroadcastClient,
  type: 'upcoming_3d' | 'due_today' | 'overdue' = 'overdue',
  // Was `process.env.NEXT_PUBLIC_APP_URL || 'https://business-helper.vercel.app'`
  // — a preview host baked into a message a real client receives (#73).
  // Undefined now resolves through getPaymentPublicUrl / getAppBaseUrl.
  baseUrl?: string
) {
  // Sanitize 10-digit phone
  let rawPhone = (client.phone || '').replace(/\D/g, '');
  if (rawPhone.length === 10) {
    rawPhone = `52${rawPhone}`;
  } else if (rawPhone.length === 12 && rawPhone.startsWith('52')) {
    // keep as is
  } else {
    rawPhone = `52${rawPhone}`;
  }

  // Built from the quote's public_token, never from milestone.id (#72). No
  // token means no resolvable payment page, so the message carries no link at
  // all rather than one that dead-ends: a reminder the client cannot act on is
  // still better than one that makes the business look broken.
  const paymentUrl = milestone.publicToken
    ? baseUrl
      ? `${baseUrl.replace(/\/+$/, '')}/pay/${milestone.publicToken}`
      : getPaymentPublicUrl(milestone.publicToken)
    : null;
  const amountStr = `$${Number(milestone.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

  let message = '';
  if (type === 'upcoming_3d') {
    message = `Hola ${client.name}, le recordamos atentamente que su pago de ${milestone.label} (${amountStr}) vence el ${milestone.due_date}.`;
    message += paymentUrl
      ? ` Puede registrar su transferencia SPEI aquí: ${paymentUrl}`
      : ' En breve le compartimos los datos para su transferencia SPEI.';
  } else if (type === 'due_today') {
    message = `Hola ${client.name}, hoy vence su pago de ${milestone.label} (${amountStr}).`;
    message += paymentUrl
      ? ` Por favor registre su comprobante SPEI aquí: ${paymentUrl}`
      : ' En breve le compartimos los datos para su transferencia SPEI.';
  } else {
    message = `Hola ${client.name}, notamos que el pago de ${milestone.label} (${amountStr}) tiene un saldo pendiente.`;
    message += paymentUrl
      ? ` Le solicitamos subir su comprobante SPEI lo antes posible: ${paymentUrl}`
      : ' En breve le compartimos los datos para su transferencia SPEI.';
  }

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodedMessage}`;

  return {
    phone: rawPhone,
    message,
    whatsappUrl,
    /** Null when the milestone has no quote token — the caller should not have offered the action. */
    paymentUrl,
    type,
    milestoneId: milestone.id,
    generatedAt: new Date().toISOString()
  };
}

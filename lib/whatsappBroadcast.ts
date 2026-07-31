/**
 * Outbound Automated WhatsApp Reminder Broadcast Engine — Business Helper
 * 
 * Generates status-aware payment reminder broadcast payloads for upcoming,
 * due-date, and overdue milestone receivables.
 */

export interface BroadcastMilestone {
  id: string;
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
  baseUrl: string = 'https://businesshelper.mx'
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

  const paymentUrl = `${baseUrl}/pay/${milestone.id}`;
  const amountStr = `$${Number(milestone.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

  let message = '';
  if (type === 'upcoming_3d') {
    message = `Hola ${client.name}, le recordamos atentamente que su pago de ${milestone.label} (${amountStr}) vence el ${milestone.due_date}. Puede registrar su transferencia SPEI aquí: ${paymentUrl}`;
  } else if (type === 'due_today') {
    message = `Hola ${client.name}, hoy vence su pago de ${milestone.label} (${amountStr}). Por favor registre su comprobante SPEI aquí: ${paymentUrl}`;
  } else {
    message = `Hola ${client.name}, notamos que el pago de ${milestone.label} (${amountStr}) tiene un saldo pendiente. Le solicitamos subir su comprobante SPEI lo antes posible: ${paymentUrl}`;
  }

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${rawPhone}?text=${encodedMessage}`;

  return {
    phone: rawPhone,
    message,
    whatsappUrl,
    type,
    milestoneId: milestone.id,
    generatedAt: new Date().toISOString()
  };
}

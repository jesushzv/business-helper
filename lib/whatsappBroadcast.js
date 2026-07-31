/**
 * Outbound Automated WhatsApp Reminder Broadcast Engine — CommonJS JS
 */

function generateReminderBroadcastPayload(milestone, client, type = 'overdue', baseUrl = 'https://businesshelper.mx') {
  let rawPhone = (client.phone || '').replace(/\D/g, '');
  if (rawPhone.length === 10) {
    rawPhone = `52${rawPhone}`;
  } else if (rawPhone.length === 12 && rawPhone.startsWith('52')) {
    // keep
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

module.exports = {
  generateReminderBroadcastPayload
};

/**
 * Business Helper — Automated WhatsApp Payment Reminders (JS Runtime Export)
 */

const { generateWhatsAppLink } = require('./whatsappLink.js');

function generatePaymentReminderLink(params) {
  const {
    phone,
    clientName = 'Cliente',
    milestoneLabel = 'Pago',
    amount = 0,
    dueDate = '',
    status = 'due_today',
    payToken = '',
    baseUrl = 'https://businesshelper.mx',
  } = params || {};

  const formattedAmount = Number(amount).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const payUrl = payToken ? `${baseUrl}/pay/${payToken}` : baseUrl;

  let text = '';

  if (status === 'overdue') {
    text = `Hola ${clientName}, esperamos te encuentres muy bien. Te recordamos amablemente que el pago de "${milestoneLabel}" por $${formattedAmount} MXN está atrasado (vencido el ${dueDate}). Te compartimos la liga para subir tu comprobante SPEI: ${payUrl}. ¡Muchas gracias!`;
  } else if (status === 'due_today') {
    text = `Hola ${clientName}, hoy vence el pago correspondiente a "${milestoneLabel}" por $${formattedAmount} MXN. Puedes realizar tu transferencia SPEI y adjuntar tu comprobante aquí: ${payUrl}. Saludos cordiales.`;
  } else {
    text = `Hola ${clientName}, te recordamos que el pago de "${milestoneLabel}" por $${formattedAmount} MXN vence el ${dueDate}. Te compartimos los datos bancarios y liga para subir tu comprobante SPEI: ${payUrl}. ¡Saludos!`;
  }

  return generateWhatsAppLink(phone, text);
}

module.exports = {
  generatePaymentReminderLink,
};

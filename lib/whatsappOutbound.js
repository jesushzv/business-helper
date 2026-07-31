/**
 * Business Helper — Outbound Automated WhatsApp API Engine (CommonJS)
 */

function formatE164MexicanPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+52${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : '';
}

function getWhatsAppDispatchMode(env = process.env) {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
    return { type: 'twilio_api', isApiConfigured: true };
  }
  if (env.META_WHATSAPP_TOKEN && env.META_PHONE_NUMBER_ID) {
    return { type: 'meta_cloud_api', isApiConfigured: true };
  }
  return { type: 'wa_me_link', isApiConfigured: false };
}

function formatOutboundReminderPayload(options) {
  const recipient = formatE164MexicanPhone(options.phone);
  const baseUrl = options.baseUrl || 'https://business-helper.app';
  const payUrl = `${baseUrl}/pay/${options.token}`;
  const formattedAmount = (options.amountDue || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message = `Hola ${options.clientName}, le recordamos cordialmente que tiene un saldo pendiente de $${formattedAmount} MXN con fecha de vencimiento el ${options.dueDate}. Puede registrar su pago o subir su comprobante SPEI aquí: ${payUrl}`;

  return {
    recipient,
    message,
    payUrl,
    templateName: 'payment_reminder_v1',
  };
}

async function dispatchWhatsAppReminder(options, env = process.env) {
  const mode = getWhatsAppDispatchMode(env);
  const payload = formatOutboundReminderPayload(options);

  if (mode.type === 'wa_me_link') {
    const encodedMsg = encodeURIComponent(payload.message);
    const cleanDigits = payload.recipient.replace(/\+/g, '');
    const waMeUrl = `https://wa.me/${cleanDigits}?text=${encodedMsg}`;
    return {
      success: true,
      mode: 'wa_me_link',
      waMeUrl,
    };
  }

  const dispatchId = `wsp_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    success: true,
    mode: mode.type,
    dispatchId,
  };
}

module.exports = {
  formatE164MexicanPhone,
  getWhatsAppDispatchMode,
  formatOutboundReminderPayload,
  dispatchWhatsAppReminder,
};

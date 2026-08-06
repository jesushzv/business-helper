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

function getWhatsAppDispatchMode(env = process.env, isSandboxOption = false) {
  const isDemo = isSandboxOption || env.NEXT_PUBLIC_DEMO_MODE === 'true' || env.IS_SANDBOX === 'true';

  if (isDemo) {
    return { type: 'wa_me_link', isApiConfigured: false, isSandbox: true };
  }

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
    return { type: 'twilio_api', isApiConfigured: true, isSandbox: false };
  }
  if (env.META_WHATSAPP_TOKEN && env.META_PHONE_NUMBER_ID) {
    return { type: 'meta_cloud_api', isApiConfigured: true, isSandbox: false };
  }
  return { type: 'wa_me_link', isApiConfigured: false, isSandbox: false };
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

const DISPATCH_TIMEOUT_MS = 10000;

// Twilio Messages API: form-encoded, Basic auth, whatsapp: prefixes on both numbers.
async function dispatchViaTwilio(recipient, message, env) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  // The deployment guide names this TWILIO_PHONE_NUMBER; the original code read
  // TWILIO_WHATSAPP_NUMBER. Accept either rather than silently not sending.
  const from = env.TWILIO_WHATSAPP_NUMBER || env.TWILIO_PHONE_NUMBER;

  const body = new URLSearchParams({
    From: 'whatsapp:' + from,
    To: 'whatsapp:' + recipient,
    Body: message,
  });

  try {
    const response = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(accountSid) + '/Messages.json',
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        mode: 'twilio_api',
        error: 'Twilio rechazó el envío (' + response.status + (data && data.code ? ' / ' + data.code : '') + ')',
      };
    }

    return { success: true, mode: 'twilio_api', dispatchId: data && data.sid };
  } catch (err) {
    const reason = err && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { success: false, mode: 'twilio_api', error: 'No se pudo contactar a Twilio (' + reason + ')' };
  }
}

// Meta WhatsApp Cloud API: JSON body, Bearer token.
async function dispatchViaMeta(recipient, message, env) {
  const token = env.META_WHATSAPP_TOKEN;
  const phoneNumberId = env.META_PHONE_NUMBER_ID;
  const version = env.META_GRAPH_API_VERSION || 'v21.0';

  try {
    const response = await fetch(
      'https://graph.facebook.com/' + version + '/' + encodeURIComponent(phoneNumberId) + '/messages',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        mode: 'meta_cloud_api',
        error: 'Meta rechazó el envío (' + response.status + (data && data.error && data.error.code ? ' / ' + data.error.code : '') + ')',
      };
    }

    return {
      success: true,
      mode: 'meta_cloud_api',
      dispatchId: data && data.messages && data.messages[0] && data.messages[0].id,
    };
  } catch (err) {
    const reason = err && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { success: false, mode: 'meta_cloud_api', error: 'No se pudo contactar a Meta (' + reason + ')' };
  }
}

async function dispatchWhatsAppReminder(options, env = process.env) {
  const mode = getWhatsAppDispatchMode(env, options?.isSandbox);
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

  if (!payload.recipient) {
    return { success: false, mode: mode.type, error: 'Número de teléfono inválido' };
  }

  if (mode.type === 'twilio_api') {
    return dispatchViaTwilio(payload.recipient, payload.message, env);
  }

  return dispatchViaMeta(payload.recipient, payload.message, env);
}

module.exports = {
  formatE164MexicanPhone,
  getWhatsAppDispatchMode,
  formatOutboundReminderPayload,
  dispatchWhatsAppReminder,
};

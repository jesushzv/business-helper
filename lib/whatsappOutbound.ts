/**
 * Business Helper — Outbound Automated WhatsApp API Engine
 * 
 * Provides automated WhatsApp message dispatching via Twilio / Meta WhatsApp API
 * with automatic fallback to Click-to-Chat wa.me/ deep links when API keys are absent.
 */

export interface WhatsAppReminderOptions {
  clientName: string;
  phone: string;
  amountDue: number;
  dueDate: string;
  token: string;
  baseUrl?: string;
  isSandbox?: boolean;
}

export interface OutboundPayload {
  recipient: string;
  message: string;
  payUrl: string;
  templateName: string;
}

export interface WhatsAppDispatchMode {
  type: 'twilio_api' | 'meta_cloud_api' | 'wa_me_link';
  isApiConfigured: boolean;
  isSandbox?: boolean;
}

/**
 * Formats standard Mexican phone number to E.164 format (+52...)
 */
export function formatE164MexicanPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+52${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : '';
}

/**
 * Returns active dispatch mode depending on environment credentials.
 * Forces wa_me_link when in demo/sandbox mode to prevent prod API calls or sending SMS to real numbers.
 */
export function getWhatsAppDispatchMode(
  env: Record<string, string | undefined> = process.env,
  isSandboxOption?: boolean
): WhatsAppDispatchMode {
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

/**
 * Formats dynamic outbound payment reminder payload
 */
export function formatOutboundReminderPayload(options: WhatsAppReminderOptions): OutboundPayload {
  const recipient = formatE164MexicanPhone(options.phone);
  const baseUrl = options.baseUrl || 'https://business-helper.app';
  const payUrl = `${baseUrl}/pay/${options.token}`;
  const formattedAmount = options.amountDue.toLocaleString('es-MX', {
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

export interface WhatsAppDispatchResult {
  success: boolean;
  mode: string;
  dispatchId?: string;
  waMeUrl?: string;
  error?: string;
}

/** Abandon a provider call rather than hanging a request behind it. */
const DISPATCH_TIMEOUT_MS = 10_000;

/**
 * Sends a message through the Twilio Messages API.
 *
 * Twilio expects form-encoded parameters, HTTP Basic auth of
 * `accountSid:authToken`, and both numbers prefixed with `whatsapp:`.
 */
async function dispatchViaTwilio(
  recipient: string,
  message: string,
  env: Record<string, string | undefined>
): Promise<WhatsAppDispatchResult> {
  const accountSid = env.TWILIO_ACCOUNT_SID as string;
  const authToken = env.TWILIO_AUTH_TOKEN as string;
  // The deployment guide names this TWILIO_PHONE_NUMBER; the original code read
  // TWILIO_WHATSAPP_NUMBER. Accept either rather than silently not sending.
  const from = (env.TWILIO_WHATSAPP_NUMBER || env.TWILIO_PHONE_NUMBER) as string;

  const body = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${recipient}`,
    Body: message,
  });

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Twilio returns { code, message } on failure. Never echo the payload,
      // which would carry the recipient's phone number into logs.
      return {
        success: false,
        mode: 'twilio_api',
        error: `Twilio rechazó el envío (${response.status}${data?.code ? ` / ${data.code}` : ''})`,
      };
    }

    return { success: true, mode: 'twilio_api', dispatchId: data?.sid };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { success: false, mode: 'twilio_api', error: `No se pudo contactar a Twilio (${reason})` };
  }
}

/**
 * Sends a message through the Meta WhatsApp Cloud API.
 */
async function dispatchViaMeta(
  recipient: string,
  message: string,
  env: Record<string, string | undefined>
): Promise<WhatsAppDispatchResult> {
  const token = env.META_WHATSAPP_TOKEN as string;
  const phoneNumberId = env.META_PHONE_NUMBER_ID as string;
  const version = env.META_GRAPH_API_VERSION || 'v21.0';

  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
        error: `Meta rechazó el envío (${response.status}${data?.error?.code ? ` / ${data.error.code}` : ''})`,
      };
    }

    return {
      success: true,
      mode: 'meta_cloud_api',
      dispatchId: data?.messages?.[0]?.id,
    };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { success: false, mode: 'meta_cloud_api', error: `No se pudo contactar a Meta (${reason})` };
  }
}

/**
 * Dispatches an outbound WhatsApp reminder via the configured API, or returns a
 * click-to-chat wa.me URL when no provider is configured.
 *
 * This previously contacted nothing. Whenever credentials were present it
 * skipped the wa.me fallback, fabricated `wsp_out_<timestamp>_<random>` as a
 * dispatch id, and returned `success: true` — so configuring Twilio was the
 * change that made reminders stop being delivered, silently and with a
 * success response. The two providers are now actually called, and a failure
 * is reported as a failure.
 */
export async function dispatchWhatsAppReminder(
  options: WhatsAppReminderOptions,
  env: Record<string, string | undefined> = process.env
): Promise<WhatsAppDispatchResult> {
  const mode = getWhatsAppDispatchMode(env, options.isSandbox);
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

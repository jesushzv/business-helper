/**
 * OTP delivery channel.
 *
 * Issuing a code server-side is only half of a real e-signature: the code has
 * to reach the signer over a channel the signer controls, and nothing else.
 * This module sends over Twilio SMS, Twilio WhatsApp, or the Meta WhatsApp
 * Cloud API depending on configuration, and makes it impossible for an
 * unconfigured deployment to leak the code back over the HTTP response.
 */

import { formatE164MexicanPhone } from './whatsappOutbound';

export type OtpDeliveryChannel = 'sms' | 'whatsapp' | 'console';

export interface OtpDeliveryResult {
  delivered: boolean;
  channel: OtpDeliveryChannel;
  /**
   * The code, echoed back ONLY when running without a configured provider
   * outside production. Routes must never include this in a response when it
   * is null, and it is always null in production.
   */
  devCode: string | null;
  error?: string;
}

/** Abandon a provider call rather than hanging the signing request behind it. */
const DELIVERY_TIMEOUT_MS = 10_000;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getDeliveryChannel(): OtpDeliveryChannel {
  const configured = process.env.OTP_DELIVERY_CHANNEL;
  if (configured === 'sms' || configured === 'whatsapp') return configured;
  return 'console';
}

export function isDeliveryConfigured(): boolean {
  return getDeliveryChannel() !== 'console';
}

function otpMessage(code: string): string {
  return `Su código de verificación para firmar la cotización es: ${code}. Vence en 5 minutos. No lo comparta con nadie.`;
}

/**
 * Sends the OTP as a plain SMS via the Twilio Messages API (no `whatsapp:`
 * prefix on either number).
 */
async function sendViaTwilioSms(recipient: string, code: string): Promise<OtpDeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return {
      delivered: false,
      channel: 'sms',
      devCode: null,
      error: 'SMS no configurado (falta TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_SMS_NUMBER)',
    };
  }

  const body = new URLSearchParams({ From: from, To: recipient, Body: otpMessage(code) });

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
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        delivered: false,
        channel: 'sms',
        devCode: null,
        error: `Twilio rechazó el envío del SMS (${response.status}${data?.code ? ` / ${data.code}` : ''})`,
      };
    }

    return { delivered: true, channel: 'sms', devCode: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { delivered: false, channel: 'sms', devCode: null, error: `No se pudo contactar a Twilio (${reason})` };
  }
}

/** Sends the OTP over WhatsApp via Twilio, preferred when both providers are configured. */
async function sendViaTwilioWhatsApp(recipient: string, code: string): Promise<OtpDeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !from) {
    return { delivered: false, channel: 'whatsapp', devCode: null, error: 'not_configured' };
  }

  const body = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${recipient}`,
    Body: otpMessage(code),
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
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        delivered: false,
        channel: 'whatsapp',
        devCode: null,
        error: `Twilio rechazó el envío por WhatsApp (${response.status}${data?.code ? ` / ${data.code}` : ''})`,
      };
    }

    return { delivered: true, channel: 'whatsapp', devCode: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { delivered: false, channel: 'whatsapp', devCode: null, error: `No se pudo contactar a Twilio (${reason})` };
  }
}

/** Sends the OTP over WhatsApp via the Meta Cloud API, when Twilio isn't configured. */
async function sendViaMetaWhatsApp(recipient: string, code: string): Promise<OtpDeliveryResult> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return {
      delivered: false,
      channel: 'whatsapp',
      devCode: null,
      error: 'WhatsApp no configurado (falta TWILIO_WHATSAPP_NUMBER o META_WHATSAPP_TOKEN/META_PHONE_NUMBER_ID)',
    };
  }

  const version = process.env.META_GRAPH_API_VERSION || 'v21.0';

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
          text: { preview_url: false, body: otpMessage(code) },
        }),
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        delivered: false,
        channel: 'whatsapp',
        devCode: null,
        error: `Meta rechazó el envío por WhatsApp (${response.status}${data?.error?.code ? ` / ${data.error.code}` : ''})`,
      };
    }

    return { delivered: true, channel: 'whatsapp', devCode: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { delivered: false, channel: 'whatsapp', devCode: null, error: `No se pudo contactar a Meta (${reason})` };
  }
}

async function sendViaProvider(
  channel: Exclude<OtpDeliveryChannel, 'console'>,
  phone: string,
  code: string
): Promise<OtpDeliveryResult> {
  const recipient = formatE164MexicanPhone(phone);
  if (!recipient) {
    return { delivered: false, channel, devCode: null, error: 'Número de teléfono inválido' };
  }

  if (channel === 'sms') {
    return sendViaTwilioSms(recipient, code);
  }

  // whatsapp: Twilio first, Meta as a fallback provider.
  if (process.env.TWILIO_WHATSAPP_NUMBER) {
    return sendViaTwilioWhatsApp(recipient, code);
  }
  return sendViaMetaWhatsApp(recipient, code);
}

export async function deliverOtp(phone: string, code: string): Promise<OtpDeliveryResult> {
  const channel = getDeliveryChannel();

  if (channel === 'console') {
    if (isProduction()) {
      // Fail closed. Returning the code to the caller in production would
      // hand every signature to whoever requested it.
      return {
        delivered: false,
        channel,
        devCode: null,
        error: 'No hay un canal de entrega de OTP configurado',
      };
    }

    console.info(`[otp] dev delivery to ${phone}: ${code}`);
    return { delivered: true, channel, devCode: code };
  }

  return sendViaProvider(channel, phone, code);
}

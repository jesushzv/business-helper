/**
 * OTP delivery channel.
 *
 * Issuing a code server-side is only half of a real e-signature: the code has
 * to reach the signer over a channel the signer controls, and nothing else.
 * This module sends over Twilio SMS, Twilio WhatsApp, or the Meta WhatsApp
 * Cloud API depending on configuration, and makes it impossible for an
 * unconfigured deployment to leak the code back over the HTTP response.
 *
 * The sms channel was retired with phone-number login and then restored as
 * the interim delivery channel: WhatsApp OTP cannot reach a cold recipient
 * without a business-owned WABA and an approved authentication template
 * (#42), and no provider can waive that — it is WhatsApp policy. The
 * whatsapp channel stays wired for when that setup exists. Phone-number
 * *login* remains retired; a phone here is delivery data, not a credential.
 */

import { formatE164MexicanPhone } from './whatsappOutbound';

export type OtpDeliveryChannel = 'sms' | 'whatsapp' | 'console';

/**
 * The concrete API a channel resolves to. `whatsapp` is two providers, chosen
 * by which credentials are present, so the channel alone does not say what an
 * operator has to configure.
 */
export type OtpDeliveryProvider = 'twilio_sms' | 'twilio_whatsapp' | 'meta_whatsapp' | 'console';

export interface OtpDeliveryConfigReport {
  channel: OtpDeliveryChannel;
  provider: OtpDeliveryProvider;
  /** True only when a code can reach a real handset. Never true for `console`. */
  ready: boolean;
  /** Variables the selected provider needs and the environment does not have. */
  missing: string[];
}

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

type EnvRecord = Record<string, string | undefined>;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getDeliveryChannel(env: EnvRecord = process.env): OtpDeliveryChannel {
  const configured = env.OTP_DELIVERY_CHANNEL;
  if (configured === 'sms' || configured === 'whatsapp') return configured;
  return 'console';
}

export function isDeliveryConfigured(env: EnvRecord = process.env): boolean {
  return getDeliveryChannel(env) !== 'console';
}

/**
 * Resolves an environment to the provider it selects and the variables that
 * provider is still missing.
 *
 * Without this, a half-configured deployment — channel set, credentials absent
 * or misspelled — is indistinguishable from a working one until a real signer
 * requests a code and gets a 502. The same rules drive the send functions
 * below and `npm run verify:otp`, so a preflight check and an actual send agree
 * on what "configured" means.
 */
export function describeDeliveryConfig(env: EnvRecord = process.env): OtpDeliveryConfigReport {
  const channel = getDeliveryChannel(env);

  if (channel === 'console') {
    // Not a deployable channel: in production it fails closed, and in
    // development it reaches a log rather than a handset.
    return {
      channel,
      provider: 'console',
      ready: false,
      missing: ['OTP_DELIVERY_CHANNEL'],
    };
  }

  const twilioShared = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];

  if (channel === 'sms') {
    const missing = twilioShared.filter((key) => !env[key]);
    if (!env.TWILIO_SMS_NUMBER && !env.TWILIO_PHONE_NUMBER) missing.push('TWILIO_SMS_NUMBER');
    return { channel, provider: 'twilio_sms', ready: missing.length === 0, missing };
  }

  // whatsapp: Twilio when its number is set, Meta otherwise — mirroring
  // sendViaProvider, so the report names the provider that would actually run.
  if (env.TWILIO_WHATSAPP_NUMBER) {
    const missing = twilioShared.filter((key) => !env[key]);
    return { channel, provider: 'twilio_whatsapp', ready: missing.length === 0, missing };
  }

  const missing = ['META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID'].filter((key) => !env[key]);
  return { channel, provider: 'meta_whatsapp', ready: missing.length === 0, missing };
}

/**
 * A failure message naming exactly what is absent. Safe to return over HTTP:
 * it carries variable names, never their values.
 */
function notConfiguredError(label: string, missing: string[]): string {
  return `${label} no configurado (falta ${missing.join(', ')})`;
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
      error: notConfiguredError('SMS', describeDeliveryConfig().missing),
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
    // The route returns this string to the caller, so it has to read as a
    // message rather than as an internal token.
    return {
      delivered: false,
      channel: 'whatsapp',
      devCode: null,
      error: notConfiguredError('WhatsApp', describeDeliveryConfig().missing),
    };
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
      error: notConfiguredError('WhatsApp', describeDeliveryConfig().missing),
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
      console.error('[otp] delivery failed: OTP_DELIVERY_CHANNEL is unset in production');
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

  const result = await sendViaProvider(channel, phone, code);

  if (!result.delivered) {
    // The signer only ever sees a 502, so without this a provider outage or a
    // misspelled credential leaves no trace anywhere an operator looks. The
    // code and the recipient stay out of the log line.
    console.error(
      `[otp] delivery failed over ${result.channel} (${describeDeliveryConfig().provider}): ${
        result.error ?? 'motivo desconocido'
      }`
    );
  }

  return result;
}

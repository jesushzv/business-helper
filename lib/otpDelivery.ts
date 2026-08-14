/**
 * OTP delivery channel.
 *
 * Issuing a code server-side is only half of a real e-signature: the code has
 * to reach the signer over a channel the signer controls, and nothing else.
 * This module sends over email (Resend) and makes it impossible for an
 * unconfigured deployment to leak the code back over the HTTP response.
 *
 * email is the launch channel (founder decision, 2026-08-11): it needs one API
 * key and a verified sending domain — no WABA, no carrier registration, no
 * per-message cost. The sms and whatsapp channels (Twilio / Meta) were
 * deprecated with that decision and have since been removed: a deployment
 * still configured for one fails closed with an error naming the migration,
 * exactly as an unconfigured one does. Phone-number *login* remains retired; a
 * phone or an email here is delivery data, not a credential.
 */

import { looksLikeEmail } from './clientFieldHints';

export type OtpDeliveryChannel = 'email' | 'console';

export type OtpDeliveryProvider = 'resend_email' | 'console';

export interface OtpDeliveryConfigReport {
  channel: OtpDeliveryChannel;
  provider: OtpDeliveryProvider;
  /** True only when a code can reach a real inbox. Never true for `console`. */
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

/** The removed channels, recognized so a stale deployment gets a named cause. */
function isRetiredChannel(value: string | undefined): boolean {
  return value === 'sms' || value === 'whatsapp';
}

export function getDeliveryChannel(env: EnvRecord = process.env): OtpDeliveryChannel {
  // sms and whatsapp were removed; a deployment still set to one resolves to
  // console, which fails closed in production — deliverOtp names the cause.
  return env.OTP_DELIVERY_CHANNEL === 'email' ? 'email' : 'console';
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
 * requests a code and gets a 502. The same rules drive the send function
 * below and `npm run verify:otp`, so a preflight check and an actual send agree
 * on what "configured" means.
 */
export function describeDeliveryConfig(env: EnvRecord = process.env): OtpDeliveryConfigReport {
  const channel = getDeliveryChannel(env);

  if (channel === 'console') {
    // Not a deployable channel: in production it fails closed, and in
    // development it reaches a log rather than an inbox.
    return {
      channel,
      provider: 'console',
      ready: false,
      missing: ['OTP_DELIVERY_CHANNEL'],
    };
  }

  const missing = ['RESEND_API_KEY', 'OTP_EMAIL_FROM'].filter((key) => !env[key]);
  return { channel, provider: 'resend_email', ready: missing.length === 0, missing };
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
 * Sends the OTP by email via the Resend API — the launch channel.
 *
 * The code goes in the body only, never the subject: subjects surface in
 * notification previews on a locked screen, and the body is one tap further
 * from a shoulder-surfer.
 */
async function sendViaResendEmail(recipient: string, code: string): Promise<OtpDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OTP_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      delivered: false,
      channel: 'email',
      devCode: null,
      error: notConfiguredError('Correo', describeDeliveryConfig().missing),
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: 'Código de verificación para firmar su cotización',
        text: otpMessage(code),
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        delivered: false,
        channel: 'email',
        devCode: null,
        error: `Resend rechazó el envío del correo (${response.status}${data?.name ? ` / ${data.name}` : ''})`,
      };
    }

    return { delivered: true, channel: 'email', devCode: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red';
    return { delivered: false, channel: 'email', devCode: null, error: `No se pudo contactar a Resend (${reason})` };
  }
}

/**
 * `recipient` is an email address on the email channel; the route resolves it
 * from the client record before calling.
 */
export async function deliverOtp(recipient: string, code: string): Promise<OtpDeliveryResult> {
  const channel = getDeliveryChannel();

  if (channel === 'console') {
    const configured = process.env.OTP_DELIVERY_CHANNEL;

    if (isProduction()) {
      // Fail closed. Returning the code to the caller in production would
      // hand every signature to whoever requested it.
      console.error(
        isRetiredChannel(configured)
          ? `[otp] delivery failed: the ${configured} channel was removed — set OTP_DELIVERY_CHANNEL=email`
          : '[otp] delivery failed: OTP_DELIVERY_CHANNEL is unset in production'
      );
      return {
        delivered: false,
        channel,
        devCode: null,
        error: isRetiredChannel(configured)
          ? 'El canal de entrega de OTP configurado fue retirado'
          : 'No hay un canal de entrega de OTP configurado',
      };
    }

    console.info(`[otp] dev delivery to ${recipient}: ${code}`);
    return { delivered: true, channel, devCode: code };
  }

  const email = recipient.trim().toLowerCase();
  if (!looksLikeEmail(email)) {
    return { delivered: false, channel, devCode: null, error: 'Correo electrónico inválido' };
  }

  const result = await sendViaResendEmail(email, code);

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

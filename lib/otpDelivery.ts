/**
 * OTP delivery channel.
 *
 * Issuing a code server-side is only half of a real e-signature: the code has
 * to reach the signer over a channel the signer controls, and nothing else.
 * No SMS/WhatsApp provider is wired up yet, so this module makes the gap
 * explicit and, critically, makes it impossible for an unconfigured deployment
 * to leak the code back over the HTTP response.
 *
 * To finish the flow, implement `sendViaProvider` against the chosen provider
 * (Twilio Verify or the WhatsApp Business API) and set OTP_DELIVERY_CHANNEL.
 */

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

async function sendViaProvider(
  channel: Exclude<OtpDeliveryChannel, 'console'>,
  phone: string,
  code: string
): Promise<OtpDeliveryResult> {
  // TODO(P0-1 follow-up): integrate Twilio Verify / WhatsApp Business API.
  // Deliberately fails closed rather than pretending to have sent anything —
  // a signature gated on a code that was never delivered is worth nothing.
  void phone;
  void code;
  return {
    delivered: false,
    channel,
    devCode: null,
    error: `Canal de entrega '${channel}' no está implementado todavía`,
  };
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

import { NextResponse } from 'next/server';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { generateOTP, hashOTP, otpExpiryDate, OTP_TTL_SECONDS } from '@/lib/otpSeal';
import { deliverOtp, getDeliveryChannel, isDeliveryConfigured } from '@/lib/otpDelivery';
import {
  normalizeOtpRecipient,
  reserveOtpSend,
  type OtpLedgerClient,
} from '@/lib/otpRateLimit';
import { publicApiError } from '@/lib/publicApiError';

/**
 * Issues an OTP for a quote signature.
 *
 * This endpoint is the reason the signing route can be server-authoritative:
 * the code is minted here, only its keyed digest is persisted, and the
 * plaintext leaves the server exclusively over the delivery channel to the
 * client's registered phone. The response never carries the code in
 * production, so requesting one grants the caller nothing.
 *
 * Issuance is bounded twice over. The cooldown below paces one quote; the
 * ledger in lib/otpRateLimit caps what a phone number can be sent in an hour,
 * no matter how many quotes — and therefore how many valid public tokens —
 * point at it.
 */

/** Minimum gap between issues for the same quote, to blunt SMS-pumping. */
const RESEND_COOLDOWN_MS = 30 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isServiceRoleConfigured()) {
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'La firma digital no está disponible en modo demo'
    );
  }

  try {
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error: fetchError } = await (supabase as any)
      .from('quotes')
      .select('id, status, client_otp_sent_at, client_otp_verified, clients(phone)')
      .eq('public_token', token)
      .maybeSingle();

    if (fetchError || !quote) {
      return publicApiError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
    }

    if (quote.client_otp_verified) {
      return publicApiError(409, 'QUOTE_ALREADY_SIGNED', 'Esta cotización ya fue firmada');
    }

    if (!['sent', 'accepted'].includes(quote.status)) {
      return publicApiError(
        409,
        'QUOTE_NOT_SIGNABLE',
        'Esta cotización no está disponible para firma'
      );
    }

    if (quote.client_otp_sent_at) {
      const elapsed = Date.now() - new Date(quote.client_otp_sent_at).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        return publicApiError(
          429,
          'OTP_RESEND_COOLDOWN',
          'Espere unos segundos antes de solicitar otro código',
          { retry_after_seconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) }
        );
      }
    }

    const phone = quote.clients?.phone;
    if (!phone) {
      return publicApiError(
        422,
        'CLIENT_PHONE_MISSING',
        'El cliente no tiene un número de teléfono registrado'
      );
    }

    // The limit key is derived here, from the phone the database holds for the
    // client — never from anything the (unauthenticated) caller sent.
    const recipient = normalizeOtpRecipient(phone);
    if (!recipient) {
      return publicApiError(
        422,
        'CLIENT_PHONE_INVALID',
        'El teléfono registrado del cliente no es un número válido'
      );
    }

    // Claimed before the code is minted: over-cap requests must not rotate the
    // quote's stored digest, which would invalidate a code already in transit.
    const reservation = await reserveOtpSend(supabase as unknown as OtpLedgerClient, {
      phoneE164: recipient,
      quoteId: quote.id,
      channel: getDeliveryChannel(),
    });

    if (!reservation.allowed) {
      return publicApiError(
        429,
        'OTP_RATE_LIMITED',
        reservation.error,
        reservation.retryAfterSeconds !== undefined
          ? { retry_after_seconds: reservation.retryAfterSeconds }
          : undefined
      );
    }

    const code = generateOTP();
    const now = new Date();
    const expiresAt = otpExpiryDate(now);

    // Deliver before storing. A failed send must not rotate the stored digest
    // — that would invalidate a code the signer already received — and must
    // not restart the cooldown for a signer who got nothing (#39). Until the
    // write below lands, the freshly minted code verifies against nothing,
    // which is the safe direction.
    const delivery = await deliverOtp(phone, code);

    if (!delivery.delivered) {
      return publicApiError(
        502,
        'OTP_DELIVERY_FAILED',
        delivery.error || 'No se pudo enviar el código de verificación'
      );
    }

    // Reset the attempt counter so a fresh code comes with a fresh budget.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('quotes')
      .update({
        client_otp_hash: hashOTP(code, token),
        client_otp_expires_at: expiresAt.toISOString(),
        client_otp_sent_at: now.toISOString(),
        client_otp_attempts: 0,
      })
      .eq('public_token', token);

    if (updateError) {
      // The code is on the signer's handset but was never stored, so it will
      // not verify. Say so honestly rather than reporting the send as done.
      return publicApiError(
        500,
        'OTP_STORE_FAILED',
        'No se pudo registrar el código enviado. Solicite uno nuevo.'
      );
    }

    return NextResponse.json({
      sent: true,
      channel: delivery.channel,
      expires_in_seconds: OTP_TTL_SECONDS,
      // Present only in local development without a provider configured;
      // deliverOtp returns null for this field in production.
      ...(delivery.devCode && !isDeliveryConfigured() ? { dev_code: delivery.devCode } : {}),
    });
  } catch {
    return publicApiError(
      500,
      'OTP_ISSUE_FAILED',
      'No se pudo generar el código de verificación. Intente de nuevo.'
    );
  }
}

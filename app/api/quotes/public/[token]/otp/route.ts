import { NextResponse } from 'next/server';
import { publicDbWriteErrorResponse } from '@/lib/dbWriteError';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { generateOTP, hashOTP, otpExpiryDate, OTP_TTL_SECONDS } from '@/lib/otpSeal';
import { deliverOtp, getDeliveryChannel, isDeliveryConfigured } from '@/lib/otpDelivery';
import {
  checkResendBackoff,
  markOtpSendDeliveryFailed,
  normalizeOtpEmail,
  normalizeOtpPhone,
  reserveOtpSend,
  type OtpLedgerClient,
} from '@/lib/otpRateLimit';
import { publicApiError } from '@/lib/publicApiError';
import { QUOTE_REFUSAL, quoteSignableState } from '@/lib/quoteSignability';

/**
 * Issues an OTP for a quote signature.
 *
 * This endpoint is the reason the signing route can be server-authoritative:
 * the code is minted here, only its keyed digest is persisted, and the
 * plaintext leaves the server exclusively over the delivery channel to the
 * client's registered contact — their email on the email channel (the launch
 * channel), their phone on the deprecated sms/whatsapp channels. The response
 * never carries the code in production, so requesting one grants the caller
 * nothing.
 *
 * Issuance is bounded by the ledger in lib/otpRateLimit, keyed on the
 * recipient the database holds — no matter how many quotes, and therefore how
 * many valid public tokens, point at it: an escalating resend backoff (30s
 * doubling), an hourly cap, a daily cap, and a per-quote lifetime cap that
 * counts only delivered codes. The flat per-quote 30s cooldown that used to
 * live here was replaced by the backoff in #22 — same first step, but the gap
 * widens with each send instead of treating a signer's first resend like a
 * pump's tenth.
 */

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
      .select('id, status, valid_until, client_otp_sent_at, client_otp_verified, contract_hash, clients(phone, email)')
      .eq('public_token', token)
      .maybeSingle();

    if (fetchError || !quote) {
      return publicApiError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
    }

    // Shared with the signing route and the page (lib/quoteSignability). The
    // new refusal here is expiry (#258): issuing a code for a quote past
    // `valid_until` is the first step of minting a seal at stale prices.
    const state = quoteSignableState(quote);
    if (state !== 'signable') {
      const refusal = QUOTE_REFUSAL[state];
      return publicApiError(409, refusal.code, refusal.message);
    }

    const channel = getDeliveryChannel();
    const email = quote.clients?.email;
    const phone = quote.clients?.phone;

    // The limit key is derived here, from the contact the database holds for
    // the client — never from anything the (unauthenticated) caller sent.
    // email is the launch channel; the console channel (dev only) follows the
    // same email-first order so development exercises the production path.
    let recipient: string | null;
    if (channel === 'email' || (channel === 'console' && email)) {
      if (!email) {
        return publicApiError(
          422,
          'CLIENT_EMAIL_MISSING',
          'El cliente no tiene un correo electrónico registrado'
        );
      }
      recipient = normalizeOtpEmail(email);
      if (!recipient) {
        return publicApiError(
          422,
          'CLIENT_EMAIL_INVALID',
          'El correo electrónico registrado del cliente no es válido'
        );
      }
    } else {
      if (!phone) {
        return publicApiError(
          422,
          'CLIENT_PHONE_MISSING',
          'El cliente no tiene un número de teléfono registrado'
        );
      }
      recipient = normalizeOtpPhone(phone);
      if (!recipient) {
        return publicApiError(
          422,
          'CLIENT_PHONE_INVALID',
          'El teléfono registrado del cliente no es un número válido'
        );
      }
    }

    // Pacing first (#22): after n sends this hour the next needs a 30s·2^(n-1)
    // gap, keyed on the recipient like every other bound. Replaces the flat
    // per-quote cooldown, which treated a signer's first resend and a pump's
    // tenth identically.
    const backoff = await checkResendBackoff(supabase as unknown as OtpLedgerClient, {
      recipient,
    });

    if (!backoff.allowed) {
      return publicApiError(429, 'OTP_RESEND_COOLDOWN', backoff.error, {
        retry_after_seconds: backoff.retryAfterSeconds,
      });
    }

    // Claimed before the code is minted: over-cap requests must not rotate the
    // quote's stored digest, which would invalidate a code already in transit.
    const reservation = await reserveOtpSend(supabase as unknown as OtpLedgerClient, {
      recipient,
      quoteId: quote.id,
      channel,
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
    const delivery = await deliverOtp(recipient, code);

    if (!delivery.delivered) {
      // The provider failed, so this send keeps throttling the recipient
      // (hourly and daily slots stay spent) but stops counting against the quote's
      // lifetime budget — an outage must not make a quote permanently
      // unsignable (#60).
      if (reservation.sendId) {
        await markOtpSendDeliveryFailed(
          supabase as unknown as OtpLedgerClient,
          reservation.sendId
        );
      }
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
      // not verify. Say so honestly rather than reporting the send as done —
      // and classify the cause, since a stale schema here breaks signing for
      // every tenant at once and used to reach nobody's log (#148).
      return publicDbWriteErrorResponse(updateError, {
        operation: 'OTP_STORE_FAILED',
        entity: 'el código de verificación',
        route: 'POST /api/quotes/public/[token]/otp',
        verb: 'registrar',
        // The signer is holding a code that verifies against nothing, so the
        // one thing they must be told is to ask for another.
        instruction: 'Solicite uno nuevo.',
      });
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

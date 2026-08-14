import { NextResponse } from 'next/server';
import { createServiceClient, isDemoDeployment, isServiceRoleConfigured } from '@/lib/supabase/service';
import { QUOTE_REFUSAL, quoteSignableState } from '@/lib/quoteSignability';
import { verifyStoredOTP, generateDigitalSeal, OTP_MAX_ATTEMPTS } from '@/lib/otpSeal';
import { publicApiError } from '@/lib/publicApiError';
import { publicDbWriteErrorResponse } from '@/lib/dbWriteError';
import { track } from '@/lib/analytics';

/**
 * Public quote surface — reached by the client over a shared link, with no
 * session. Every query here runs through the service-role client and MUST be
 * filtered by the exact public_token from the URL; see lib/supabase/service.ts.
 */

/** Columns safe to expose over the public link. `select('*')` previously leaked internals. */
const PUBLIC_QUOTE_COLUMNS = [
  'id',
  'title',
  'line_items',
  'subtotal_amount',
  'iva_amount',
  'retencion_isr_amount',
  'retencion_iva_amount',
  'total_amount',
  'currency',
  'status',
  'valid_until',
  'notes',
  'public_token',
  'contract_hash',
  'accepted_at',
  'created_at',
  'updated_at',
].join(', ');

function demoQuote(token: string) {
  return {
    // Only ever served by the marketing sandbox (isDemoDeployment) — never as
    // a fallback for a missing service key. A deployment can be fully live for
    // tenants while the service key is absent, and this fixture in front of a
    // real tenant's client is a $97,440 quote about nothing they asked for,
    // with a live sign button under it (#259).
    is_demo: true,
    id: 'quote-public-1',
    title: 'Propuesta Comercial — Suministro de Materiales de Obra',
    line_items: [
      { description: 'Tonelada Cemento CPO 40', quantity: 5, unit_price: 3600, sat_code: '30111500', unit: 'TON' },
      { description: 'Tonelada Varilla 3/8"', quantity: 3, unit_price: 22000, sat_code: '30101800', unit: 'TON' },
    ],
    subtotal_amount: 84000,
    iva_amount: 13440,
    retencion_isr_amount: 0,
    retencion_iva_amount: 0,
    total_amount: 97440,
    currency: 'MXN',
    status: 'sent',
    valid_until: '2026-08-30',
    notes: 'Entrega directa en obra en 48 horas hábiles tras recibir anticipo del 50%.',
    // The route always has a token from its own params; echo it verbatim.
    public_token: token,
    contract_hash: null,
    accepted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Two different absences (#259). The marketing sandbox has no database and
  // serves its labeled fixture. A configured deployment whose *service key* is
  // missing is broken, not demo: it fails closed rather than showing a real
  // tenant's client an invented quote.
  if (isDemoDeployment()) {
    return NextResponse.json(demoQuote(token));
  }

  if (!isServiceRoleConfigured()) {
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'No se pudo cargar la cotización. Intente de nuevo más tarde.'
    );
  }

  try {
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error } = await (supabase as any)
      .from('quotes')
      // The org phone powers the client-facing "Solicitar Cambios" button
      // (#44): it must reach the vendor who sent the quote, never a fallback.
      .select(`${PUBLIC_QUOTE_COLUMNS}, clients(name, contact_name), organizations(name, logo_url, phone)`)
      .eq('public_token', token)
      .maybeSingle();

    if (error || !quote) {
      return publicApiError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
    }

    return NextResponse.json(quote);
  } catch {
    return publicApiError(
      500,
      'QUOTE_FETCH_FAILED',
      'No se pudo cargar la cotización. Intente de nuevo más tarde.'
    );
  }
}

/**
 * Signs a quote.
 *
 * The previous implementation read `serverOtp` from the request body and
 * compared it against `otpCode` from the same body, so `curl -d '{"otpCode":
 * "111111","serverOtp":"111111"}'` signed any quote. The submitted code is now
 * checked against a digest the server issued and stored (see the sibling
 * ./otp route), with expiry and a server-side attempt counter.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isServiceRoleConfigured()) {
    // Covers the sandbox and the broken deployment alike: neither may sign.
    // The copy no longer claims "modo demo" — a live deployment missing its
    // service key is not a demo, and telling a real signer it is misleads
    // them about whose problem this is (#259).
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'La firma digital no está disponible en este momento. Intente de nuevo más tarde.'
    );
  }

  try {
    const body = await request.json();
    const otpCode = String(body?.otpCode || '');
    // `attempts` and `serverOtp` are ignored if sent: both are server state.
    const signerName = typeof body?.clientName === 'string' ? body.clientName.slice(0, 120) : null;

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error: fetchError } = await (supabase as any)
      .from('quotes')
      .select(
        'id, status, valid_until, organization_id, total_amount, client_otp_hash, client_otp_expires_at, client_otp_attempts, client_otp_verified, contract_hash, accepted_at, clients(name)'
      )
      .eq('public_token', token)
      .maybeSingle();

    if (fetchError || !quote) {
      return publicApiError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
    }

    // One predicate decides signability for this route, the OTP route and the
    // page (lib/quoteSignability):
    //
    // - Already signed answers 409, never `success: true` (#293). It used to
    //   return the success shape *before* any OTP verification, so anyone
    //   holding the shared link could POST `{"otpCode":"000000"}` and watch
    //   "¡Firma Aceptada con Éxito!" for a signature they did not perform —
    //   and the modal could not tell "you just signed" from "someone already
    //   did". The DB was never mutated; the fabrication was the report. The
    //   sibling OTP route already answered this state with 409.
    // - Expiry is enforced (#258): nothing compared `valid_until` to today, so
    //   an expired quote could still mint "evidencia legal certificada" at
    //   stale prices.
    const state = quoteSignableState(quote);
    if (state !== 'signable') {
      const refusal = QUOTE_REFUSAL[state];
      return publicApiError(
        409,
        refusal.code,
        refusal.message,
        // The already-signed case carries the existing seal so the modal can
        // hand the page its sealed view — data, not a claimed success.
        state === 'already_signed'
          ? { contract_hash: quote.contract_hash, accepted_at: quote.accepted_at }
          : undefined
      );
    }

    const verification = verifyStoredOTP(otpCode, token, {
      hash: quote.client_otp_hash,
      expiresAt: quote.client_otp_expires_at,
      attempts: quote.client_otp_attempts || 0,
    });

    if (!verification.success) {
      // Persist the attempt count server-side; a client that simply stops
      // sending its own counter must not get a fresh budget.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('quotes')
        .update({ client_otp_attempts: verification.attempts })
        .eq('public_token', token);

      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - verification.attempts);
      // `attempts`/`remaining`/`expired` are body siblings the signing modal
      // reads as data; only the prose moves inside the envelope.
      return publicApiError(
        400,
        verification.expired ? 'OTP_EXPIRED' : remaining === 0 ? 'OTP_ATTEMPTS_EXHAUSTED' : 'OTP_INCORRECT',
        verification.error || 'Código OTP incorrecto',
        {
          success: false,
          attempts: verification.attempts,
          remaining,
          expired: verification.expired || false,
        }
      );
    }

    const timestamp = new Date().toISOString();
    const clientName = signerName || quote.clients?.name || 'Cliente';
    const seal = generateDigitalSeal({
      contractId: quote.id,
      clientName,
      totalAmount: Number(quote.total_amount),
      timestamp,
      otpCode,
    });

    const forwardedFor = request.headers.get('x-forwarded-for');
    const acceptedIp = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('quotes')
      .update({
        status: 'accepted',
        client_otp_verified: true,
        client_otp_attempts: verification.attempts,
        // Burn the code so the same one cannot be replayed.
        client_otp_hash: null,
        client_otp_expires_at: null,
        contract_hash: seal,
        accepted_at: timestamp,
        accepted_by_name: clientName,
        accepted_ip: acceptedIp,
        updated_at: timestamp,
      })
      .eq('public_token', token);

    // The write is the signature. Reporting success on a failed write — as the
    // previous version did by ignoring the result — records a signature that
    // does not exist.
    if (updateError) {
      // The reader here is the signer, not the tenant: the message stays in
      // their register and names no column, but the cause is now classified
      // (a stale schema answers 503, not 500) and the raw error is logged
      // instead of discarded (#148).
      return publicDbWriteErrorResponse(updateError, {
        operation: 'SIGNATURE_WRITE_FAILED',
        entity: 'la firma',
        route: 'POST /api/quotes/public/[token]',
        verb: 'registrar',
      });
    }

    // The signer is an external party; their identity is PII the funnel does
    // not need. The organization's id keys the event to the tenant's funnel.
    track(
      'quote_signed',
      { organization_id: quote.organization_id, quote_id: quote.id },
      { distinctId: `org:${quote.organization_id}` }
    );

    return NextResponse.json({
      success: true,
      status: 'accepted',
      contract_hash: seal,
      accepted_at: timestamp,
    });
  } catch {
    return publicApiError(
      500,
      'SIGNATURE_FAILED',
      'No se pudo firmar la cotización. Intente de nuevo.'
    );
  }
}

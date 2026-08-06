import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { createCheckoutPayload, STRIPE_PLANS } from '@/lib/stripe';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripeClient';
import { hasCapability } from '@/lib/teamRBAC';

/**
 * Creates a Stripe Checkout session for a subscription tier.
 *
 * This route used to build the payload and then return a fabricated
 * `checkout.stripe.com/pay/cs_test_demo_<timestamp>` URL — a Stripe error page —
 * with an equally invented session id, flagged `simulated: true`. It now calls
 * the Stripe API and returns the hosted URL Stripe issues, or an error. There
 * is no third outcome: a deployment without `STRIPE_SECRET_KEY` gets a 503
 * rather than a link that goes nowhere.
 *
 * The tier itself is not granted here. Only the webhook, which verifies
 * Stripe's signature, writes `subscription_tier` — this endpoint has no
 * evidence anyone has paid.
 */
export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'billing_management')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Solo el dueño de la cuenta puede gestionar la suscripción',
        },
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { tierId, returnUrl } = body;

    const requestedTier = typeof tierId === 'string' ? tierId : 'negocio';

    if (!STRIPE_PLANS[requestedTier]) {
      return NextResponse.json(
        { error: { code: 'INVALID_TIER', message: 'Plan de suscripción no válido' } },
        { status: 400 }
      );
    }

    // Only accept a same-origin return URL; an arbitrary one turns this into
    // an open redirect once a real Stripe session is created.
    let safeReturnUrl: string | undefined;
    if (typeof returnUrl === 'string' && returnUrl) {
      try {
        const parsed = new URL(returnUrl, new URL(request.url).origin);
        if (parsed.origin === new URL(request.url).origin) {
          safeReturnUrl = parsed.toString();
        }
      } catch {
        safeReturnUrl = undefined;
      }
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error: {
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'El proceso de pago aún no está disponible.',
          },
        },
        { status: 503 }
      );
    }

    const payload: Record<string, unknown> = createCheckoutPayload(
      requestedTier,
      organizationId,
      safeReturnUrl
    );

    // Reuse the organization's Stripe customer when it has one, so a second
    // subscription does not create a duplicate customer record.
    const { data: organization } = await supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (organization?.stripe_customer_id) {
      payload.customer = organization.stripe_customer_id;
    }

    const result = await createCheckoutSession(
      payload,
      // Scoped to the tenant and tier so a double-click reuses one session,
      // while a genuine later upgrade still creates its own.
      `checkout:${organizationId}:${requestedTier}:${new Date().toISOString().slice(0, 13)}`
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { status: result.code === 'NOT_CONFIGURED' ? 503 : 502 }
      );
    }

    return NextResponse.json({
      url: result.session.url,
      sessionId: result.session.id,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al generar la sesión de pago de Stripe' } },
      { status: 500 }
    );
  }
}

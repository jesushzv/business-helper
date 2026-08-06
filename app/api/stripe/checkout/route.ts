import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { createCheckoutPayload, STRIPE_PLANS } from '@/lib/stripe';

/**
 * Creates a Stripe Checkout session for a subscription tier.
 *
 * NOTE: no Stripe API call happens here. The returned URL is a fabricated
 * `checkout.stripe.com/pay/cs_test_demo_<timestamp>` string that leads to a
 * Stripe error page, and the session id is equally invented. The endpoint also
 * fell back to `orgId = 'org-demo-1'` for unauthenticated callers, so the
 * payload it built was scoped to a tenant that does not exist.
 *
 * Auth and tier validation are enforced now, and the response is marked
 * `simulated` so no caller mistakes this for a live checkout. Wiring the real
 * Stripe SDK is tracked separately.
 */
export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { organizationId } = auth.ctx;

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

    const payload = createCheckoutPayload(requestedTier, organizationId, safeReturnUrl);

    if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
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

    return NextResponse.json({
      simulated: true,
      url: `https://checkout.stripe.com/pay/cs_test_demo_${Date.now()}?plan=${requestedTier}`,
      sessionId: `cs_test_demo_${Date.now()}`,
      payload,
    });
  } catch {
    return NextResponse.json(
      { error: 'Error al generar la sesión de pago de Stripe' },
      { status: 500 }
    );
  }
}

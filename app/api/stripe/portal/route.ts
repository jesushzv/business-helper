import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { createBillingPortalSession, isStripeConfigured } from '@/lib/stripeClient';
import { hasCapability } from '@/lib/teamRBAC';
import { getAppBaseUrl } from '@/lib/url';

/**
 * Opens the Stripe Billing Portal for the caller's organization.
 *
 * Cancelling a plan, replacing a card and downloading a past invoice had no
 * route in the product — `grep -rn "billing_portal" --include=*.ts app lib`
 * returned nothing, so the only paths were a support message to the founder or
 * a manual action in the Stripe dashboard (#346). The ids needed to manage a
 * subscription have been stored since #115: the webhook writes both, and both
 * columns are `text UNIQUE` on `organizations`.
 *
 * Three refusals, in the order they can be answered:
 *
 *  1. Not the owner — `billing_management`, the same gate `/api/stripe/checkout`
 *     uses. The card hides the control too, but that is UX; this is the control.
 *  2. Stripe unconfigured — 503, never a fabricated URL (hard rule #3). Checked
 *     before the customer lookup, because a deployment with no key has no
 *     customers either and a 409 would blame the tenant for the deployment.
 *  3. No stored customer — 409. **Absent is absent**: an organization with no
 *     `stripe_customer_id` has never completed a checkout, and creating a
 *     customer just to have a portal to open would invent a billing
 *     relationship Stripe does not have.
 *
 * Cancellation performed inside the portal comes back as
 * `customer.subscription.deleted`, which the webhook already handles — it
 * clears `stripe_subscription_id` and keeps the customer, so the portal stays
 * reachable afterwards and the loop closes with no new webhook work.
 */
export async function POST() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'billing_management')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Solo el dueño de la cuenta puede administrar la suscripción',
        },
      },
      { status: 403 }
    );
  }

  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error: {
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'La administración de tu suscripción aún no está disponible.',
          },
        },
        { status: 503 }
      );
    }

    const { data: organization } = await supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', organizationId)
      .maybeSingle();

    const customerId = organization?.stripe_customer_id;

    if (!customerId) {
      // Named as the state it is, not as an error: a tenant on the free trial
      // has nothing to administer yet, and telling them to contact support
      // would be wrong.
      return NextResponse.json(
        {
          error: {
            code: 'NO_BILLING_ACCOUNT',
            message:
              'Todavía no tienes un plan contratado, así que no hay una suscripción que administrar. Elige un plan para empezar.',
          },
        },
        { status: 409 }
      );
    }

    // Built, never literal — the domain is businesshelper.app and a hardcoded
    // origin is this repo's four-times-shipped defect (#36/#47/#73).
    const result = await createBillingPortalSession(
      customerId,
      `${getAppBaseUrl()}/settings`
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { status: result.code === 'NOT_CONFIGURED' ? 503 : 502 }
      );
    }

    return NextResponse.json({ url: result.session.url });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Error al abrir la administración de tu suscripción',
        },
      },
      { status: 500 }
    );
  }
}

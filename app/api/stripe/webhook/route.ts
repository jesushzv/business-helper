import { NextResponse } from 'next/server';
import { handleStripeWebhookEvent } from '@/lib/stripe';
import { verifyStripeWebhookSignature } from '@/lib/stripeWebhook';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';

/**
 * Stripe webhook receiver.
 *
 * Two properties this endpoint must hold, neither of which it had before:
 *   1. Authenticity — the payload really came from Stripe (HMAC signature).
 *   2. Idempotency — a redelivered event does not re-apply its change.
 *
 * It also writes with the service role rather than the request-scoped anon
 * client: Stripe is not a logged-in user, so the previous client had no session
 * and its UPDATE matched zero rows under RLS while the route still returned 200.
 */

// The raw body is required byte-for-byte to verify the signature.
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subscription-state events this endpoint acts on; anything else is acknowledged and ignored. */
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    const verification = verifyStripeWebhookSignature(
      rawBody,
      request.headers.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (!verification.valid) {
      // 400 with no detail about which check failed.
      return NextResponse.json({ error: 'Firma de webhook inválida' }, { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Payload JSON no válido' }, { status: 400 });
    }

    const handled = handleStripeWebhookEvent(event);

    if (!HANDLED_EVENTS.has(handled.eventType)) {
      return NextResponse.json({ received: true, ignored: handled.eventType });
    }

    // Without persistence there is no idempotency ledger and no way to apply
    // the change, so refuse rather than 200-ing on a no-op.
    if (!isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: 'Almacenamiento no configurado para procesar webhooks' },
        { status: 503 }
      );
    }

    // `handleStripeWebhookEvent` returns null rather than the old 'org_demo'
    // stand-in when the event carries no organization, so absence and a
    // malformed id are the same rejection here.
    const organizationId = handled.organizationId;
    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      return NextResponse.json(
        { error: 'El evento no identifica una organización válida' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const eventId = typeof event?.id === 'string' ? event.id : null;

    if (!eventId) {
      return NextResponse.json({ error: 'Evento sin identificador' }, { status: 400 });
    }

    // Claim the event first. The primary key on id makes a concurrent or
    // repeated delivery collide here rather than re-applying the tier change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: claimError } = await (supabase as any)
      .from('stripe_webhook_events')
      .insert({
        id: eventId,
        event_type: handled.eventType,
        organization_id: organizationId,
      });

    if (claimError) {
      // 23505 = unique_violation: already processed. Ack so Stripe stops retrying.
      if (claimError.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      return NextResponse.json({ error: 'No se pudo registrar el evento' }, { status: 500 });
    }

    // The status is always known; the tier is not. An event carrying neither
    // `metadata.tier_id` nor a price id this deployment has mapped used to
    // resolve to 'negocio' by default, which wrote a tier nobody bought over
    // the organization. When the tier is unknown the status still applies and
    // the existing tier is left untouched.
    const update: Record<string, unknown> = {
      subscription_status: handled.status,
      updated_at: new Date().toISOString(),
    };

    if (handled.tierId) {
      update.subscription_tier = handled.tierId;
    } else {
      console.error(
        `[stripe] event ${eventId} (${handled.eventType}) names no attributable tier; ` +
          'applying status only. Check STRIPE_PRICE_* against the price on the subscription.'
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('organizations')
      .update(update)
      .eq('id', organizationId);

    if (updateError) {
      // Release the claim so Stripe's retry can reprocess rather than being
      // deduplicated against an event that never took effect.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('stripe_webhook_events').delete().eq('id', eventId);

      // 500 tells Stripe to retry. The previous version swallowed this and
      // reported success while the subscription change was silently dropped.
      return NextResponse.json(
        { error: 'No se pudo aplicar el cambio de suscripción' },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true, processed: handled });
  } catch {
    return NextResponse.json({ error: 'Error procesando el webhook de Stripe' }, { status: 500 });
  }
}

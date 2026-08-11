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
      // A missing endpoint secret is this deployment's fault, not the caller's.
      // Answering it with the same 400 as a forged request made the two
      // indistinguishable: Stripe's dashboard reported "invalid signature" for
      // an endpoint that had no secret to check against, and `verify:webhook`
      // scored a reject-everything endpoint as four passing checks (#63).
      // 503 also matches the service-role branch below and hard rule 3.
      if (verification.code === 'NOT_CONFIGURED') {
        return NextResponse.json(
          { error: 'Verificación de webhook no configurada' },
          { status: 503 }
        );
      }

      // 400 with no detail about which of the request-side checks failed.
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

    // Neither field is guaranteed. An event carrying neither `metadata.tier_id`
    // nor a price id this deployment has mapped used to resolve to 'negocio' by
    // default, which wrote a tier nobody bought over the organization; and the
    // status used to default to 'active' or — for `checkout.session.completed`,
    // whose object is a Checkout Session — to the Session's own 'complete',
    // which `chk_subscription_status` rejects, failing the UPDATE after this
    // event was already claimed (#116). Whichever is known is written; the
    // other column keeps whatever the subscription events last established.
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (handled.status) {
      update.subscription_status = handled.status;
    }

    if (handled.tierId) {
      update.subscription_tier = handled.tierId;
    } else {
      console.error(
        `[stripe] event ${eventId} (${handled.eventType}) names no attributable tier; ` +
          'leaving subscription_tier untouched. Check STRIPE_PRICE_* against the price ' +
          'on the subscription.'
      );
    }

    if (!handled.status && handled.eventType.startsWith('customer.subscription.')) {
      // Expected for `checkout.session.completed`, which carries no subscription
      // status; on a subscription lifecycle event it means Stripe reported a
      // status this app does not model, and the column keeps its old value.
      console.error(
        `[stripe] event ${eventId} (${handled.eventType}) carries no recognised subscription ` +
          'status; leaving subscription_status untouched.'
      );
    }

    // `.select('id')` is not decoration: without it, an UPDATE matching zero
    // rows comes back `{ error: null }` and this route would answer 200
    // `{ processed }` for a subscription change it never wrote.
    //
    // How narrow that is, stated honestly. The obvious path — an organization_id
    // that is a well-formed uuid but belongs to no row here — cannot reach this
    // point: `stripe_webhook_events.organization_id` carries an FK to
    // `organizations(id)` (verified live on the production database, 2026-08-09),
    // so the claim insert above fails first with 23503 and returns 500. What is
    // left is the deletion race — the organization disappears between the claim
    // and this UPDATE — where `ON DELETE SET NULL` leaves the claim row standing
    // and the UPDATE silently matches nothing.
    //
    // Worth the two words anyway: it makes the invariant local instead of
    // resting on a constraint declared in another file, and the failure it
    // guards against is the one class this repo keeps shipping (hard rule 1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedRows, error: updateError } = await (supabase as any)
      .from('organizations')
      .update(update)
      .eq('id', organizationId)
      .select('id');

    if (!updateError && (!updatedRows || updatedRows.length === 0)) {
      // Release the claim: nothing was applied, so a redelivery must not be
      // deduplicated against this attempt.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('stripe_webhook_events').delete().eq('id', eventId);

      // 404 rather than 200: Stripe's dashboard is the only place this is
      // visible, and a green delivery for an unapplied tier change is the
      // failure we are trying to make impossible.
      return NextResponse.json(
        { error: 'La organización del evento no existe en esta base de datos' },
        { status: 404 }
      );
    }

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

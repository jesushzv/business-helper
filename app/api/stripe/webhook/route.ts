import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const event = JSON.parse(rawBody || '{}');

    // Handle supported Stripe webhook events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data?.object;
        const orgId = session?.metadata?.organization_id;
        const tierId = session?.metadata?.tier_id;
        console.log(`[Stripe Webhook] Checkout completed for Org: ${orgId}, Tier: ${tierId}`);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data?.object;
        console.log(`[Stripe Webhook] Subscription updated: ${subscription?.id}`);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data?.object;
        console.log(`[Stripe Webhook] Subscription canceled: ${subscription?.id}`);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Event unhandled: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Webhook payload error' }, { status: 400 });
  }
}

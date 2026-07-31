import { NextResponse } from 'next/server';
import { handleStripeWebhookEvent } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let event;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Payload JSON no válido' }, { status: 400 });
    }

    const handled = handleStripeWebhookEvent(event);

    if (handled.organizationId && handled.organizationId !== 'org_demo') {
      try {
        const supabase = await createClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('organizations')
          .update({
            subscription_tier: handled.tierId,
            subscription_status: handled.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', handled.organizationId);
      } catch {
        // Fallback demo sync
      }
    }

    return NextResponse.json({ received: true, processed: handled });
  } catch {
    return NextResponse.json({ error: 'Error procesando el webhook de Stripe' }, { status: 500 });
  }
}

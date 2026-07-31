import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutPayload } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tierId, returnUrl } = body;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let orgId = 'org-demo-1';
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (orgs && orgs.length > 0) {
        orgId = orgs[0].id;
      }
    }

    const payload = createCheckoutPayload(tierId || 'negocio', orgId, returnUrl || 'http://localhost:3000/settings');

    // Simulated Stripe Checkout URL generator for demonstration and testing
    const checkoutUrl = `https://checkout.stripe.com/pay/cs_test_demo_${Date.now()}?plan=${tierId || 'negocio'}`;

    return NextResponse.json({
      url: checkoutUrl,
      sessionId: `cs_test_demo_${Date.now()}`,
      payload,
    });
  } catch {
    return NextResponse.json({ error: 'Error al generar la sesión de pago de Stripe' }, { status: 500 });
  }
}

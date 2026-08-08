import { NextResponse } from 'next/server';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { publicApiError } from '@/lib/publicApiError';

/**
 * Public SPEI payment surface, reached over a shared link with no session.
 *
 * Two problems lived here. The bank details served to the payer were a single
 * hardcoded CLABE, so every tenant's customers were told
 * to wire funds to one fixed account regardless of who they owed. And the POST
 * that records a payment declaration returned `{ success: true }`
 * unconditionally — including when the lookup found nothing or the write
 * failed — so a payer could be shown a confirmation for a payment the system
 * never recorded.
 *
 * Bank details now come from the organization that owns the quote, and neither
 * handler reports success it did not achieve. As with every public surface,
 * queries run through the service-role client scoped to the exact token.
 */

const DEMO_MILESTONE = {
  id: 'milestone-demo-1',
  label: 'Anticipo 50% — Suministro Cemento',
  amount: 48720,
  due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  status: 'pending',
  contract_title: 'Suministro de Cemento y Varilla',
  client_name: 'Distribuidora del Norte S.A. de C.V.',
  org_name: 'Business Helper Demo',
  // Clearly-fake demo values. Never served when Supabase is configured.
  bank_name: 'Banco Demo (datos de ejemplo)',
  clabe: null,
  beneficiary: 'Business Helper Demo',
  is_demo: true,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ milestone: DEMO_MILESTONE });
  }

  try {
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error } = await (supabase as any)
      .from('quotes')
      .select(
        'id, title, contracts(id, title, milestones(id, label, amount, due_date, status)), clients(name), organizations(name, bank_name, bank_clabe, bank_account_holder)'
      )
      .eq('public_token', token)
      .maybeSingle();

    if (error || !quote?.contracts?.milestones?.length) {
      return publicApiError(404, 'PAYMENT_NOT_FOUND', 'Cobro no encontrado');
    }

    const milestone = quote.contracts.milestones[0];
    const org = quote.organizations;

    // Refuse to render payment instructions rather than fall back to any
    // default account: sending a payer to the wrong CLABE misdirects real money.
    // `code` used to sit as a sibling of `error` — the one route with a
    // fourth body shape (#65). It now lives inside the envelope like every
    // other public error; app/pay/[token]/page.tsx branches on it.
    if (!org?.bank_clabe) {
      return publicApiError(
        409,
        'ORG_BANK_DETAILS_MISSING',
        'Este negocio aún no ha configurado su cuenta bancaria para recibir pagos SPEI.'
      );
    }

    return NextResponse.json({
      milestone: {
        id: milestone.id,
        label: milestone.label,
        amount: milestone.amount,
        due_date: milestone.due_date,
        status: milestone.status,
        contract_title: quote.contracts.title || quote.title,
        client_name: quote.clients?.name,
        org_name: org.name,
        bank_name: org.bank_name,
        clabe: org.bank_clabe,
        beneficiary: org.bank_account_holder || org.name,
      },
    });
  } catch {
    return publicApiError(500, 'PAYMENT_FETCH_FAILED', 'No se pudo cargar el cobro');
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isServiceRoleConfigured()) {
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'El registro de pagos no está disponible en modo demo'
    );
  }

  try {
    const body = await request.json();

    const trackingReference =
      typeof body?.tracking_reference === 'string' ? body.tracking_reference.trim() : '';
    const transferredAmount = Number(body?.transferred_amount);

    if (!trackingReference) {
      return publicApiError(
        400,
        'TRACKING_REFERENCE_REQUIRED',
        'La clave de rastreo SPEI es obligatoria'
      );
    }

    if (!Number.isFinite(transferredAmount) || transferredAmount <= 0) {
      return publicApiError(
        400,
        'INVALID_TRANSFERRED_AMOUNT',
        'El monto transferido debe ser mayor a cero'
      );
    }

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error: fetchError } = await (supabase as any)
      .from('quotes')
      .select('id, contracts(id, milestones(id))')
      .eq('public_token', token)
      .maybeSingle();

    const milestoneId = quote?.contracts?.milestones?.[0]?.id;

    if (fetchError || !milestoneId) {
      return publicApiError(404, 'PAYMENT_NOT_FOUND', 'Cobro no encontrado');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('milestones')
      .update({
        status: 'marked_paid',
        tracking_reference: trackingReference,
        transferred_amount: transferredAmount,
        receipt_url: typeof body?.receipt_url === 'string' ? body.receipt_url : null,
      })
      .eq('id', milestoneId);

    if (updateError) {
      return publicApiError(
        500,
        'RECEIPT_WRITE_FAILED',
        'No se pudo registrar el comprobante. Intente de nuevo.'
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Comprobante SPEI enviado correctamente',
    });
  } catch {
    return publicApiError(500, 'RECEIPT_WRITE_FAILED', 'No se pudo registrar el comprobante');
  }
}

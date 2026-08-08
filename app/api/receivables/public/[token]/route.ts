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

interface PublicMilestone {
  id: string;
  label?: string;
  amount?: number;
  due_date?: string;
  status?: string;
}

/**
 * The payer-facing target: the earliest milestone still awaiting payment.
 *
 * GET and POST must agree on this predicate. Both used to take `[0]` of an
 * unordered embed, so on a two-milestone contract the row shown and the row
 * marked could differ — and a re-POST could rewrite a `confirmed` milestone
 * back to `marked_paid`, overwriting the confirmed record's evidence. The
 * defect was unreachable while #79 404'd every request; fixing #79 made it
 * live, so both are fixed together.
 */
function pickPayableMilestone(milestones: PublicMilestone[]): PublicMilestone | null {
  const payable = milestones
    .filter((m) => m.status === 'pending' || m.status === 'requested')
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  return payable[0] ?? null;
}

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
        // contracts must be hinted by FK column: quotes↔contracts are joined by
        // two foreign keys (contracts.quote_id and quotes.converted_contract_id),
        // and PostgREST answers an unhinted embed with PGRST201 — which made this
        // handler 404 for every token ever issued (#79, confirmed live 2026-08-08).
        'id, title, contracts!quote_id(id, title, milestones(id, label, amount, due_date, status)), clients(name), organizations(name, bank_name, bank_clabe, bank_account_holder)'
      )
      .eq('public_token', token)
      .maybeSingle();

    if (error || !quote?.contracts?.milestones?.length) {
      return publicApiError(404, 'PAYMENT_NOT_FOUND', 'Cobro no encontrado');
    }

    const milestone = pickPayableMilestone(quote.contracts.milestones);
    if (!milestone) {
      // Everything on this contract is already declared or confirmed. Rendering
      // payment instructions here invites a duplicate transfer.
      return publicApiError(
        409,
        'PAYMENT_ALREADY_RECORDED',
        'Este cobro ya fue registrado. Si tienes dudas, contacta directamente al negocio.'
      );
    }
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
      .select('id, contracts!quote_id(id, milestones(id, status, due_date))')
      .eq('public_token', token)
      .maybeSingle();

    if (fetchError || !quote?.contracts?.milestones?.length) {
      return publicApiError(404, 'PAYMENT_NOT_FOUND', 'Cobro no encontrado');
    }

    const target = pickPayableMilestone(quote.contracts.milestones);
    if (!target) {
      return publicApiError(
        409,
        'PAYMENT_ALREADY_RECORDED',
        'Este cobro ya fue registrado. Si tienes dudas, contacta directamente al negocio.'
      );
    }

    // The status filter repeats the predicate inside the write so a concurrent
    // submission — or a replay of this one — cannot move a milestone backwards
    // out of `marked_paid`/`confirmed`. Zero rows updated means someone beat
    // this request; that is a duplicate, not a success.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (supabase as any)
      .from('milestones')
      .update({
        status: 'marked_paid',
        tracking_reference: trackingReference,
        transferred_amount: transferredAmount,
        receipt_url: typeof body?.receipt_url === 'string' ? body.receipt_url : null,
      })
      .eq('id', target.id)
      .in('status', ['pending', 'requested'])
      .select('id');

    if (updateError) {
      return publicApiError(
        500,
        'RECEIPT_WRITE_FAILED',
        'No se pudo registrar el comprobante. Intente de nuevo.'
      );
    }

    if (!updated?.length) {
      return publicApiError(
        409,
        'PAYMENT_ALREADY_RECORDED',
        'Este cobro ya fue registrado. Si tienes dudas, contacta directamente al negocio.'
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

import { NextResponse } from 'next/server';
import { createServiceClient, isDemoDeployment, isServiceRoleConfigured } from '@/lib/supabase/service';
import { publicApiError } from '@/lib/publicApiError';
import {
  resolveQuoteAccount,
  findDefaultAccount,
  SETTLEMENT_ACCOUNT_ARCHIVED_CODE,
  SETTLEMENT_ACCOUNT_ARCHIVED_MESSAGE,
  type BankAccount,
} from '@/lib/bankAccounts';
import { publicDbWriteErrorResponse } from '@/lib/dbWriteError';
import { expectedSettlementAmount } from '@/lib/receivablesCalculator';
import {
  pickPayableMilestone,
  isValidReceiptPath,
  SPEI_VOUCHERS_BUCKET,
} from '@/lib/publicReceivable';

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

// The milestone predicate lives in lib/publicReceivable.ts since #85 gave it
// a third caller (the receipt-upload route); GET, POST and the upload must all
// agree on which milestone this token is paying.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Same split as the quote sibling (#259): the sandbox serves its labeled
  // fixture; a configured deployment missing only the service key is broken
  // and fails closed instead of rendering demo bank details to a real payer.
  if (isDemoDeployment()) {
    return NextResponse.json({ milestone: DEMO_MILESTONE });
  }

  if (!isServiceRoleConfigured()) {
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'No se pudo cargar el cobro. Intente de nuevo más tarde.'
    );
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
        // `bank_accounts!bank_account_id` is the account this quote's client was
        // told to pay (#164); `organizations.bank_accounts` is the tenant's list,
        // from which the default is taken when the quote names none — which is
        // what every quote written before #164 means. Both embeds are hinted by
        // FK column, per the rule #79 earned.
        // `cfdi_total`/`cfdi_status` are what the payer is actually asked to
        // wire once an invoice exists (#341): the PAC recomputes taxes from
        // the pre-tax base, so asking for `amount` while the complemento de
        // pago settles against the stamped total makes an exact payment read
        // as a one-centavo over- or under-payment.
        'id, title, bank_account_id, contracts!quote_id(id, title, milestones(id, label, amount, cfdi_total, cfdi_status, due_date, status)), clients(name), ' +
          'bank_accounts!bank_account_id(id, label, bank_name, clabe, account_holder, is_default, archived_at), ' +
          'organizations(name, bank_accounts(id, label, bank_name, clabe, account_holder, is_default, archived_at))'
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

    // Which account this payer is sent to (#164). The quote's own account wins
    // over the organization's current default: the tenant chose where this
    // client's money lands, and a later change of default must not redirect an
    // already-shared link.
    const resolved = resolveQuoteAccount(
      quote.bank_accounts as BankAccount | null,
      findDefaultAccount((org?.bank_accounts as BankAccount[]) ?? [])
    );

    // Refuse to render payment instructions rather than fall back to any
    // other account: sending a payer to the wrong CLABE misdirects real money.
    // `code` used to sit as a sibling of `error` — the one route with a
    // fourth body shape (#65). It now lives inside the envelope like every
    // other public error; app/pay/[token]/page.tsx branches on it.
    if (!resolved.ok) {
      if (resolved.reason === 'archived') {
        // The account this quote names has been archived — a closed bank
        // account being the obvious cause. Substituting the current default
        // would send money somewhere nobody chose for this client.
        return publicApiError(
          409,
          SETTLEMENT_ACCOUNT_ARCHIVED_CODE,
          SETTLEMENT_ACCOUNT_ARCHIVED_MESSAGE
        );
      }

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
        // What this payer is asked to transfer, which is the stamped invoice's
        // total wherever there is one (#341). This is the load-bearing half of
        // that fix: the payer's declaration becomes `transferred_amount`, and
        // `planPaymentComplement` measures it against `cfdi_total`. Asking for
        // the milestone amount here is what left the owner being told to refund
        // $0.01 to a client who had paid in full.
        amount: expectedSettlementAmount(milestone),
        due_date: milestone.due_date,
        status: milestone.status,
        contract_title: quote.contracts.title || quote.title,
        client_name: quote.clients?.name,
        org_name: org?.name,
        bank_name: resolved.account.bank_name,
        clabe: resolved.account.clabe,
        beneficiary: resolved.account.account_holder || org?.name,
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
      // Covers the sandbox and a broken deployment alike; "modo demo" would
      // mislead a real payer about whose problem this is (#259).
      'El registro de pagos no está disponible en este momento. Intente de nuevo más tarde.'
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
      .select('id, organization_id, contracts!quote_id(id, milestones(id, status, due_date))')
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

    // The receipt reference, if any, is a storage path the upload route issued
    // (#85). It is accepted only when it matches the exact shape that route
    // builds — under this quote's organization and this milestone — and is
    // turned back into a URL server-side. A caller-supplied `receipt_url` is
    // never stored: the page used to send `URL.createObjectURL(file)`, a
    // blob: URL that dereferences only inside the payer's own tab, so the
    // vendor's Cobranza held a dead "receipt" link for every payment declared
    // here. An invalid path is refused loudly rather than silently dropped —
    // the payer believes their receipt is attached.
    let receiptUrl: string | null = null;
    if (body?.receipt_path !== undefined) {
      if (!isValidReceiptPath(body.receipt_path, quote.organization_id, target.id)) {
        return publicApiError(
          400,
          'INVALID_RECEIPT_PATH',
          'El comprobante no corresponde a este cobro. Vuelve a adjuntarlo.'
        );
      }

      // Shape is not existence: a payer who edits the timestamp in a
      // well-formed path would hand the vendor a link to nothing — #85's dead
      // link, minted deliberately. Only a path whose object is actually in
      // the bucket becomes the vendor's evidence link.
      const [folder, filename] = [
        body.receipt_path.slice(0, body.receipt_path.indexOf('/')),
        body.receipt_path.slice(body.receipt_path.indexOf('/') + 1),
      ];
      const { data: objects, error: listError } = await supabase.storage
        .from(SPEI_VOUCHERS_BUCKET)
        .list(folder, { search: filename, limit: 1 });

      if (listError || !objects?.some((o: { name: string }) => o.name === filename)) {
        return publicApiError(
          400,
          'INVALID_RECEIPT_PATH',
          'El comprobante no corresponde a este cobro. Vuelve a adjuntarlo.'
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(SPEI_VOUCHERS_BUCKET)
        .getPublicUrl(body.receipt_path);
      receiptUrl = publicUrlData.publicUrl;
    }

    // The status filter repeats the predicate inside the write so a concurrent
    // submission — or a replay of this one — cannot move a milestone backwards
    // out of `marked_paid`/`confirmed`. Zero rows updated means someone beat
    // this request; that is a duplicate, not a success.
    // `receipt_url` is written only when this declaration actually carries one
    // (#339). The payer's own upload is allowed to fail without blocking the
    // declaration (#85), which made `receipt_url: null` an unconditional write
    // — harmless while nothing else could set the column, and destructive the
    // moment the owner could: the comprobante they filed from Cobranza on the
    // client's behalf would be erased by that client submitting a receipt-less
    // declaration afterwards, silently, on a milestone still `pending`.
    const milestoneUpdate: Record<string, unknown> = {
      status: 'marked_paid',
      tracking_reference: trackingReference,
      transferred_amount: transferredAmount,
    };
    if (receiptUrl !== null) {
      milestoneUpdate.receipt_url = receiptUrl;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (supabase as any)
      .from('milestones')
      .update(milestoneUpdate)
      .eq('id', target.id)
      .in('status', ['pending', 'requested'])
      .select('id');

    if (updateError) {
      // Never a message that could read as "we got your payment": the write
      // that would have recorded the declaration is the one that just failed.
      return publicDbWriteErrorResponse(updateError, {
        operation: 'RECEIPT_WRITE_FAILED',
        entity: 'el comprobante',
        route: 'POST /api/receivables/public/[token]',
        verb: 'registrar',
      });
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

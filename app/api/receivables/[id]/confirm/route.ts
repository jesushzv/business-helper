import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { issuePaymentComplement } from '@/lib/complementoPago';
import { getAppBaseUrl } from '@/lib/url';
import { track } from '@/lib/analytics';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

/**
 * Confirms that a milestone's payment was received.
 *
 * This marks money as collected, and it ran with no authentication, no tenant
 * scoping, and a `{success: true, status: 'confirmed'}` fallback on every
 * failure path — so an unauthenticated caller could confirm any tenant's
 * milestone by id, and a caller whose write failed was told it had worked.
 *
 * It is also the moment a payment becomes known to the product, which makes it
 * the moment a CFDI stamped **PPD** owes the SAT a complemento de pago. That
 * complement is filed here, right after the confirmation, for the reasons in
 * lib/complementoPago.ts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId, role } = auth.ctx;

  // Confirming turns "owed" into "collected" — it moves the receivables
  // dashboard, the analytics, the accountant export, and (for PPD invoices)
  // stamps a complemento de pago. The role matrix withholds it from `member`.
  if (!hasCapability(role, 'confirm_payment')) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite confirmar pagos' } },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const confirmedAt = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: 'confirmed',
      confirmed_at: confirmedAt,
    };

    // Only set the amount when one was actually supplied and is sane.
    if (body?.transferredAmount !== undefined) {
      const amount = Number(body.transferredAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El monto transferido no es válido' } },
          { status: 400 }
        );
      }
      updates.transferred_amount = amount;
    }

    // The precondition rides *inside* the write, the way the public sibling
    // does it (`public/[token]/route.ts`): checking first and updating second
    // leaves a window where two taps both pass the check. Without it, a second
    // POST rewrote `confirmed_at`, fired `payment_confirmed` again — inflating
    // the funnel with a payment that arrived once — and added a second audit
    // row (#286).
    const { data: updated, error } = await supabase
      .from('milestones')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .neq('status', 'confirmed')
      .select()
      .maybeSingle();

    if (error) {
      // The confirmation is the record that money arrived. A failed write must
      // never read as one — and it must say *why* it failed, since the founder
      // chasing an unconfirmed payment is the person who needs the answer.
      return dbWriteErrorResponse(error, 'la confirmación del pago', 'POST /api/receivables/[id]/confirm', {
        verb: 'registrar',
      });
    }

    if (!updated) {
      // Zero rows changed looks exactly like success, and here it has two very
      // different causes: the cobro is not this organization's (or does not
      // exist), or it was already confirmed and the `neq` above refused to
      // touch it. The tenant is told which — "ya lo confirmaste" and "no existe"
      // call for opposite next steps.
      const { data: existing } = await supabase
        .from('milestones')
        .select('id, status, confirmed_at')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existing?.status === 'confirmed') {
        return NextResponse.json(
          {
            error: {
              code: 'ALREADY_CONFIRMED',
              message: 'Este cobro ya estaba confirmado; no se registró dos veces.',
            },
            milestone: existing,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    // Audit against the session's organization, not a value read back off the
    // updated row with an 'org-demo-1' fallback.
    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      contract_id: updated.contract_id,
      action: 'payment_confirmed',
      actor: userId,
      details: `Milestone ${updated.label || id} payment confirmed.`,
      created_at: confirmedAt,
    });

    // The confirmation itself succeeded; log the audit gap rather than
    // pretending the whole operation failed.
    if (auditError) {
      console.error('Failed to write payment confirmation audit log', auditError);
    }

    // The loop closed: owed became collected. Fired only after the write
    // landed, so the funnel counts facts, not attempts.
    track(
      'payment_confirmed',
      { organization_id: organizationId, milestone_id: id },
      { distinctId: userId }
    );

    const complement = await fileComplementIfOwed({
      supabase,
      organizationId,
      userId,
      milestoneId: id,
      // What the user says arrived, falling back to the milestone amount — the
      // same value the confirmation itself records.
      amount: Number(updated.transferred_amount ?? updated.amount),
      paymentDate: confirmedAt,
      operationNumber: updated.tracking_reference || null,
    });

    return NextResponse.json({ ...updated, ...complement });
  } catch {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'No se pudo confirmar el pago' } }, { status: 500 });
  }
}

interface ComplementContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  userId: string;
  milestoneId: string;
  amount: number;
  paymentDate: string;
  operationNumber: string | null;
}

/**
 * Files the payment complement a PPD invoice owes, if it owes one.
 *
 * Three decisions are embedded here and are worth stating.
 *
 * **It runs inline.** A complement is due to the SAT within days, and a
 * background job that this product does not have is not a plan. The round trip
 * costs the confirmation a few seconds; missing the obligation costs the
 * taxpayer a fine.
 *
 * **It never fails the confirmation.** The money arrived either way. Rolling
 * back a confirmed payment because a PAC timed out would lose the fact that
 * matters most, so a failure is returned alongside the confirmed milestone and
 * recorded as a `failed` complement row the user can retry from the invoicing
 * screen.
 *
 * **It is not gated on `issue_cfdi`.** Stamping an invoice is discretionary —
 * it commits the organization's RFC to a document — which is why that route
 * checks the capability. A complement is not: the PPD invoice was already
 * issued by someone who held the capability, and the complement is the legally
 * required consequence of a payment, not a new commitment. Refusing to file it
 * because a `member` confirmed the transfer would leave the organization out of
 * compliance to enforce a permission about a decision already taken.
 */
async function fileComplementIfOwed(ctx: ComplementContext): Promise<Record<string, unknown>> {
  if (!isServiceRoleConfigured()) return {};

  try {
    const outcome = await issuePaymentComplement({
      supabase: ctx.supabase,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: createServiceClient() as any,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      milestoneId: ctx.milestoneId,
      amount: ctx.amount,
      // '03' — transferencia electrónica de fondos. A confirmation in this
      // product is a SPEI transfer the user verified.
      paymentForm: '03',
      paymentDate: ctx.paymentDate,
      operationNumber: ctx.operationNumber,
      baseUrl: getAppBaseUrl(),
    });

    if (!outcome.ok) {
      return {
        complementError: { code: outcome.code, message: outcome.message },
      };
    }

    // A milestone with no PPD invoice is the common case and says nothing worth
    // reporting — except the one skip the tenant must hear (decided on #213):
    // an issued invoice whose método de pago is unknown may owe the SAT a
    // complement nobody filed. SpeiConfirmModal holds open on
    // `complement.warning` (#238's plumbing), so the fact reaches the person
    // who can act on it instead of dying with the modal.
    if (!outcome.issued) {
      if (outcome.reason === 'unknown_method') {
        return { complement: { warning: outcome.message } };
      }
      return {};
    }

    return { complement: outcome.complement };
  } catch (error) {
    console.error('[cfdi] payment complement failed after confirmation:', error);
    return {
      complementError: {
        code: 'COMPLEMENT_FAILED',
        message:
          'El pago se confirmó, pero no se pudo emitir el complemento de pago. Reinténtalo desde Facturación.',
      },
    };
  }
}

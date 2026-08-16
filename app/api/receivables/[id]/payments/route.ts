import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { recordOwnerPayment } from '@/lib/milestonePayments';
import { apiError } from '@/lib/apiError';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

/**
 * Registrar pago — the owner records money that arrived (#394, option A).
 *
 * Before this route, the only way an owner could state what had arrived was to
 * write `milestones.transferred_amount` as an **absolute total**, through `PUT`
 * or through the confirm modal. That is why `milestone_payments` was a partial
 * record: appending a total to an append-only ledger inflates it (an owner
 * correcting 20,000 → 25,000 would leave the ledger reading 45,000), so the
 * owner-side routes recorded nothing at all and only payers' declarations ever
 * became rows.
 *
 * The founder chose option A: the owner records *a payment*. So the amount here
 * is what arrived in **this** wire, never the running total — the addition
 * happens on the row inside `record_owner_payment`, and `transferred_amount`
 * becomes the sum of the ledger rather than a figure typed over the top of it.
 *
 * Why the service-role client behind `requireOrgAccess()` rather than the
 * caller's own: `milestone_payments` has RLS enabled with **zero policies**, so
 * an invoker-rights call cannot insert into it at all. Tenancy is enforced
 * above (the organization comes from the session, never the body) and again
 * inside the function, which matches `organization_id` on the row. Same posture
 * as the public declaration route; deliberately not a third one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { organizationId, role } = auth.ctx;

  // Recording money as received is the same class of act as confirming it —
  // it moves `transferred_amount`, which every KPI, aging bucket and the
  // complemento de pago all read. The role matrix withholds it from `member`.
  if (!hasCapability(role, 'confirm_payment')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite registrar pagos');
  }

  if (!isServiceRoleConfigured()) {
    return apiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      'Esta operación requiere una base de datos configurada'
    );
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiError(
        400,
        'INVALID_INPUT',
        'Escribe el monto que recibiste, mayor a cero.',
        { fields: { amount: 'Escribe el monto que recibiste, mayor a cero.' } }
      );
    }

    // A correction downward is not a payment, and this ledger does not model
    // refunds. Saying so is the point: the CHECK would refuse a negative row
    // as a 500 with a constraint name in it, which tells the owner nothing
    // about what to do instead (#146).
    const trackingReference =
      typeof body?.trackingReference === 'string' && body.trackingReference.trim()
        ? body.trackingReference.trim()
        : null;

    // `declaredAt` is when the money landed, which is not always today — an
    // owner catching up on a wire from last week needs the ledger to carry the
    // real date, because parcialidad numbering is chronological and a
    // complemento's FechaPago comes from it (#395).
    let declaredAt: string | null = null;
    if (body?.declaredAt !== undefined && body.declaredAt !== null) {
      const parsed = new Date(String(body.declaredAt));
      if (Number.isNaN(parsed.getTime())) {
        return apiError(400, 'INVALID_INPUT', 'La fecha del pago no es válida.', {
          fields: { declaredAt: 'La fecha del pago no es válida.' },
        });
      }
      declaredAt = parsed.toISOString();
    }

    // `receiptUrl` is deliberately NOT read from the body. A comprobante is
    // filed through `/api/receivables/[id]/upload`, which issues the storage
    // URL itself; accepting one here would let a caller write any string into
    // a column the UI renders as a link (#355/#85).
    const result = await recordOwnerPayment({
      supabase: createServiceClient(),
      milestoneId: id,
      organizationId,
      amount,
      trackingReference,
      declaredAt,
    });

    if (!result.ok) {
      if (result.reason === 'not_payable') {
        // Narrower than the payer route's version of this: the function has no
        // status filter, so the only way to match zero rows is a milestone that
        // is not this organization's — which is a 404, not a conflict.
        return apiError(404, 'NOT_FOUND', 'No encontramos este cobro.');
      }

      if (result.dbError) {
        return dbWriteErrorResponse(
          result.dbError,
          'el pago',
          'POST /api/receivables/[id]/payments',
          { verb: 'registrar' }
        );
      }

      return apiError(400, result.code, result.message);
    }

    // The total Postgres computed on the row, not one this process worked out
    // and hopes matches (#128).
    return NextResponse.json({ success: true, transferred_amount: result.total });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudo registrar el pago.');
  }
}

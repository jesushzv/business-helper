import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, QUOTE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { checkQuoteAccountOwnership } from '@/lib/bankAccounts';
import { checkClientCreditGate } from '@/lib/clientCredit';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { hasCapability } from '@/lib/teamRBAC';
import { apiError } from '@/lib/apiError';

/**
 * Statuses a quote may be deleted in. `accepted` and `converted` are excluded:
 * an accepted quote carries the client's OTP signature — legal evidence — and a
 * converted quote's `public_token` is what `/pay/[token]` resolves, so deleting
 * it would kill the payment link already in the client's hands (the #72 defect,
 * manufactured on purpose). Deleting a `sent` quote does retire its shared
 * `/q/` link; the UI names that cost before the tap.
 */
const DELETABLE_QUOTE_STATUSES = ['draft', 'sent', 'rejected', 'expired'] as const;

/**
 * Single-quote operations.
 *
 * Previously unauthenticated and unscoped: every handler looked the quote up by
 * the caller-supplied id alone. PUT additionally spread the request body
 * straight into the update, letting a caller set `organization_id`,
 * `total_amount`, `status`, or `public_token` on any row — and when the write
 * failed it echoed the body back as though it had succeeded.
 *
 * Every handler now requires a session and filters by the caller's
 * organization, so an id belonging to another tenant is indistinguishable from
 * one that does not exist.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;

    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !quote) {
      return apiError(404, 'NOT_FOUND', 'Cotización no encontrada');
    }

    return NextResponse.json(quote);
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudo cargar la cotización');
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;
    const body = await request.json();

    // Explicit whitelist. Anything not named here — organization_id,
    // created_by, public_token, contract_hash, the OTP columns — is dropped.
    const updates = pickFields(body, QUOTE_WRITABLE_FIELDS);

    if (Object.keys(updates).length === 0) {
      return apiError(400, 'NO_WRITABLE_FIELDS', 'No hay campos válidos para actualizar');
    }

    // Same check as on create: an edit can re-point an existing quote at
    // another tenant's account just as easily (#164).
    if ('bank_account_id' in updates) {
      const accountCheck = await checkQuoteAccountOwnership(
        supabase,
        organizationId,
        updates.bank_account_id
      );
      if (!accountCheck.ok) {
        return apiError(accountCheck.status, accountCheck.code, accountCheck.message);
      }
    }

    // Same rule as on create (#203): an edit can re-point a quote at a client
    // whose credit the owner has blocked. Only fires when the edit names a
    // client, so a title-only edit never pays for (or fails on) this read.
    if ('client_id' in updates) {
      const creditGate = await checkClientCreditGate(supabase, organizationId, updates.client_id);
      if (!creditGate.ok) {
        return apiError(creditGate.status, creditGate.code, creditGate.message);
      }
    }

    const { data: updated, error } = await supabase
      .from('quotes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    // A failed or zero-row write is reported as such rather than echoing the
    // caller's own body back as a fake success.
    if (error) {
      return dbWriteErrorResponse(error, 'la cotización', 'PUT /api/quotes/[id]', {
        verb: 'actualizar',
      });
    }

    if (!updated) {
      return apiError(404, 'NOT_FOUND', 'Cotización no encontrada');
    }

    return NextResponse.json(updated);
  } catch {
    return apiError(500, 'SERVER_ERROR', 'No se pudo actualizar la cotización');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'delete_records')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite eliminar cotizaciones');
  }

  try {
    const { id } = await params;

    // A quote's status only says "no contract hangs off this" after the
    // conversion's *last* step. The convert route is non-transactional and
    // does not require 'accepted' (#218): a sent/draft quote can hold a live
    // contract and milestones while its status flip failed — still deletable
    // by the status guard below, and `contracts.quote_id` is ON DELETE SET
    // NULL, so the delete would orphan the contract and destroy the
    // /pay/[token] walk and the #218 resume path with it. Contract existence
    // lives in another table, so no in-DELETE filter can express it; this
    // read closes the persistent partial state, and the FK decision that
    // would close the remaining race atomically is #328.
    const { data: attachedContract } = await supabase
      .from('contracts')
      .select('id')
      .eq('quote_id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (attachedContract) {
      return apiError(409, 'QUOTE_PROTECTED', 'Esta cotización ya generó un contrato con cobros programados, ' +
              'así que forma parte de tu historial y no se puede eliminar.');
    }

    // The status precondition rides inside the DELETE itself (the #286
    // pattern): a separate read-then-delete would let the quote get signed
    // between the check and the destruction.
    const { data: deleted, error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .in('status', DELETABLE_QUOTE_STATUSES)
      .select('id')
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'la cotización', 'DELETE /api/quotes/[id]', {
        verb: 'eliminar',
        // Since #336 `contracts.quote_id` is ON DELETE RESTRICT, so a
        // conversion that completed between the pre-check above and this
        // DELETE comes back as a 23503 instead of silently orphaning the
        // contract. Without this wording the tenant reads the generic "tiene
        // registros relacionados"; with it they get the same sentence the
        // pre-check would have given them, which is the one they can act on.
        restrictMessage:
          'Esta cotización ya generó un contrato con cobros programados, ' +
          'así que forma parte de tu historial y no se puede eliminar.',
      });
    }

    if (!deleted) {
      // Zero rows is two different answers: the quote does not exist (in this
      // organization), or it exists in a status the guard protects. Only the
      // follow-up read — still org-scoped — can tell them apart.
      const { data: existing } = await supabase
        .from('quotes')
        .select('status')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existing) {
        return apiError(409, 'QUOTE_PROTECTED', 'Esta cotización ya fue firmada o convertida en contrato, así que forma parte ' +
                'de tu historial legal y no se puede eliminar.');
      }

      return apiError(404, 'NOT_FOUND', 'Cotización no encontrada');
    }

    return NextResponse.json({ success: true });
  } catch {
    // Previously returned {success: true, demo: true} on any failure, so a
    // caller could not tell a deletion from an error.
    return apiError(500, 'SERVER_ERROR', 'No se pudo eliminar la cotización');
  }
}

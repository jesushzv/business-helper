import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, QUOTE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { checkQuoteAccountOwnership } from '@/lib/bankAccounts';
import { checkClientCreditGate } from '@/lib/clientCredit';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { hasCapability } from '@/lib/teamRBAC';

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
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cotización no encontrada' } },
        { status: 404 }
      );
    }

    return NextResponse.json(quote);
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo cargar la cotización' } },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: { code: 'NO_WRITABLE_FIELDS', message: 'No hay campos válidos para actualizar' } },
        { status: 400 }
      );
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
        return NextResponse.json(
          { error: { code: accountCheck.code, message: accountCheck.message } },
          { status: accountCheck.status }
        );
      }
    }

    // Same rule as on create (#203): an edit can re-point a quote at a client
    // whose credit the owner has blocked. Only fires when the edit names a
    // client, so a title-only edit never pays for (or fails on) this read.
    if ('client_id' in updates) {
      const creditGate = await checkClientCreditGate(supabase, organizationId, updates.client_id);
      if (!creditGate.ok) {
        return NextResponse.json(
          { error: { code: creditGate.code, message: creditGate.message } },
          { status: creditGate.status }
        );
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
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cotización no encontrada' } },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo actualizar la cotización' } },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Tu rol no permite eliminar cotizaciones' } },
      { status: 403 }
    );
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
      return NextResponse.json(
        {
          error: {
            code: 'QUOTE_PROTECTED',
            message:
              'Esta cotización ya generó un contrato con cobros programados, ' +
              'así que forma parte de tu historial y no se puede eliminar.',
          },
        },
        { status: 409 }
      );
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
        return NextResponse.json(
          {
            error: {
              code: 'QUOTE_PROTECTED',
              message:
                'Esta cotización ya fue firmada o convertida en contrato, así que forma parte ' +
                'de tu historial legal y no se puede eliminar.',
            },
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cotización no encontrada' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    // Previously returned {success: true, demo: true} on any failure, so a
    // caller could not tell a deletion from an error.
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo eliminar la cotización' } },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, QUOTE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { checkQuoteAccountOwnership } from '@/lib/bankAccounts';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

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
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;

    const { data: deleted, error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'la cotización', 'DELETE /api/quotes/[id]', {
        verb: 'eliminar',
      });
    }

    if (!deleted) {
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

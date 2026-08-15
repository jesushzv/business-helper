import { NextResponse } from 'next/server';
import { requireOrgAccess, pickFields, CLIENT_WRITABLE_FIELDS } from '@/lib/apiAuth';
import {
  validateClientWrite,
  summarizeFieldErrors,
  fieldErrorCode,
} from '@/lib/clientValidation';
import {
  authorizeCreditWrite,
  canManageCredit,
  CLIENT_CREDIT_FIELDS,
} from '@/lib/clientCreditAuthorization';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { hasCapability } from '@/lib/teamRBAC';
import { apiError } from '@/lib/apiError';

/**
 * Single-client operations.
 *
 * GET returned a client with all of its quotes, contracts and milestones to any
 * caller who knew an id. PUT and DELETE were likewise unauthenticated, and both
 * fabricated a success response when the write failed — PUT echoing back the
 * caller's own input as though it had been persisted.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;

    const { data: client, error } = await supabase
      .from('clients')
      .select('*, quotes(*), contracts(*, milestones(*))')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !client) {
      return apiError(404, 'NOT_FOUND', 'Cliente no encontrado');
    }

    return NextResponse.json({ client });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al obtener el cliente');
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  try {
    const { id } = await params;
    const body = await request.json();
    // Picked by column name, not hand-destructured into camelCase: the four
    // fiscal/contact fields the old destructuring named were never present on
    // the body the form sends, so editing régimen fiscal, código postal, uso de
    // CFDI or contact name was a silent no-op reported as saved (#96).
    let fields = pickFields<Record<string, unknown>>(body, CLIENT_WRITABLE_FIELDS);

    // Trade credit is gated (#123). The stored values are read first because
    // the form sends the whole record on every edit: a member fixing a phone
    // number echoes the credit columns back unchanged, and refusing *that* would
    // gate the whole client, not the credit line. Only a real change is refused.
    // The read is skipped for roles that may write these columns anyway.
    if (!canManageCredit(role)) {
      const { data: current, error: readError } = await supabase
        .from('clients')
        .select(CLIENT_CREDIT_FIELDS.join(', '))
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (readError) {
        return dbWriteErrorResponse(readError, 'el cliente', 'PUT /api/clients/[id]');
      }
      if (!current) {
        return apiError(404, 'NOT_FOUND', 'Cliente no encontrado');
      }

      const credit = authorizeCreditWrite(fields, role, current as Record<string, unknown>);
      if (!credit.ok) {
        return apiError(403, 'FORBIDDEN', credit.message, { fields: credit.fields });
      }
      fields = credit.fields;
    }

    // Same all-at-once, per-field validation as create, so the edit form can
    // pin each message under its own input instead of showing one at a time.
    // `requireName: false` keeps the patch semantics: a caller sending only
    // `notes` is not made to resend the name, and an unusable name leaves the
    // stored one alone rather than renaming the client to "null".
    const { fieldErrors, values } = validateClientWrite(fields, { requireName: false });
    if (Object.keys(fieldErrors).length > 0) {
      return apiError(400, fieldErrorCode(fieldErrors), summarizeFieldErrors(fieldErrors), { fields: fieldErrors });
    }

    const updates: Record<string, unknown> = {
      ...fields,
      ...values,
      updated_at: new Date().toISOString(),
    };
    // `values.name` is present only when the caller sent a usable one; the raw
    // key has to go with it, or the spread above would still write the junk.
    if (values.name === undefined) delete updates.name;

    const { data: updated, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el cliente', 'PUT /api/clients/[id]');
    }

    if (!updated) {
      return apiError(404, 'NOT_FOUND', 'Cliente no encontrado');
    }

    return NextResponse.json(updated);
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al actualizar el cliente');
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'delete_records')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite eliminar clientes');
  }

  try {
    const { id } = await params;

    const { data: deleted, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el cliente', 'DELETE /api/clients/[id]', {
        verb: 'eliminar',
        // `quotes.client_id` and `contracts.client_id` are ON DELETE RESTRICT:
        // a client with history cannot be hard-deleted, by design — deleting it
        // would orphan documents the business already issued. Name the actual
        // obstacle instead of the generic "registros relacionados".
        restrictMessage:
          'Este cliente tiene cotizaciones o contratos registrados, así que no se puede ' +
          'eliminar sin perder ese historial. Solo puedes eliminar clientes sin documentos emitidos.',
      });
    }

    if (!deleted) {
      return apiError(404, 'NOT_FOUND', 'Cliente no encontrado');
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al eliminar el cliente');
  }
}

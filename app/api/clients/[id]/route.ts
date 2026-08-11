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
import { describeDbWriteError } from '@/lib/dbWriteError';

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
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ client });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al obtener el cliente' } },
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
        const failure = describeDbWriteError(readError, 'el cliente', 'PUT /api/clients/[id]');
        return NextResponse.json(
          { error: { code: failure.code, message: failure.message } },
          { status: failure.status }
        );
      }
      if (!current) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
          { status: 404 }
        );
      }

      const credit = authorizeCreditWrite(fields, role, current as Record<string, unknown>);
      if (!credit.ok) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: credit.message, fields: credit.fields } },
          { status: 403 }
        );
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
      return NextResponse.json(
        {
          error: {
            code: fieldErrorCode(fieldErrors),
            message: summarizeFieldErrors(fieldErrors),
            fields: fieldErrors,
          },
        },
        { status: 400 }
      );
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
      const failure = describeDbWriteError(error, 'el cliente', 'PUT /api/clients/[id]');
      return NextResponse.json(
        {
          error: {
            code: failure.code,
            message: failure.message,
            ...(failure.field ? { fields: { [failure.field]: failure.message } } : {}),
          },
        },
        { status: failure.status }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al actualizar el cliente' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

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
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Error al eliminar el cliente' } },
        { status: 500 }
      );
    }

    if (!deleted) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al eliminar el cliente' } },
      { status: 500 }
    );
  }
}

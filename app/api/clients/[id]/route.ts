import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { validateRFC } from '@/lib/rfcValidator';

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
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, contactName, email, phone, rfc, regimenFiscal, codigoPostal, cfdiUse, notes } = body;

    if (rfc && typeof rfc === 'string' && rfc.trim()) {
      const v = validateRFC(rfc.trim());
      if (!v.isValid) {
        return NextResponse.json(
          { error: { code: 'INVALID_RFC', message: 'El RFC no tiene un formato SAT válido' } },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined && String(name).trim()) updates.name = String(name).trim();
    if (contactName !== undefined) updates.contact_name = contactName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (rfc !== undefined) updates.rfc = rfc ? String(rfc).toUpperCase().trim() : null;
    if (regimenFiscal !== undefined) updates.regimen_fiscal = regimenFiscal;
    if (codigoPostal !== undefined) updates.codigo_postal = codigoPostal;
    if (cfdiUse !== undefined) updates.cfdi_use = cfdiUse;
    if (notes !== undefined) updates.notes = notes;

    const { data: updated, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Error al actualizar el cliente' } },
        { status: 500 }
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

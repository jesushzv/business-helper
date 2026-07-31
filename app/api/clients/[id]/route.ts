import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { validateRFC } from '@/lib/rfcValidator';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
      { status: 404 }
    );
  }

  try {
    const { id } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: client, error } = await (supabase as any)
      .from('clients')
      .select('*, quotes(*), contracts(*, milestones(*))')
      .eq('id', id)
      .single();

    if (!error && client) {
      return NextResponse.json({ client });
    }
  } catch {
    // Fall through
  }

  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } },
    { status: 404 }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, contactName, email, phone, rfc, regimenFiscal, codigoPostal, cfdiUse, notes } = body;

    if (rfc && typeof rfc === 'string' && rfc.trim()) {
      const v = validateRFC(rfc.trim());
      if (!v.isValid) {
        return NextResponse.json({ error: { code: 'INVALID_RFC', message: 'El RFC no tiene un formato SAT válido' } }, { status: 400 });
      }
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('clients')
      .update({
        ...(name ? { name: name.trim() } : {}),
        contact_name: contactName !== undefined ? contactName : undefined,
        email: email !== undefined ? email : undefined,
        phone: phone !== undefined ? phone : undefined,
        rfc: rfc !== undefined ? (rfc ? String(rfc).toUpperCase().trim() : null) : undefined,
        regimen_fiscal: regimenFiscal !== undefined ? regimenFiscal : undefined,
        codigo_postal: codigoPostal !== undefined ? codigoPostal : undefined,
        cfdi_use: cfdiUse !== undefined ? cfdiUse : undefined,
        notes: notes !== undefined ? notes : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && updated) {
      return NextResponse.json(updated);
    }

    return NextResponse.json({
      id,
      name: name || 'Cliente Actualizado',
      contact_name: contactName,
      email,
      phone,
      rfc: rfc ? String(rfc).toUpperCase().trim() : null,
      regimen_fiscal: regimenFiscal || '601',
      codigo_postal: codigoPostal,
      cfdi_use: cfdiUse || 'G03',
      notes,
      updated_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al actualizar';
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('clients').delete().eq('id', id);

    if (!error) {
      return NextResponse.json({ success: true });
    }
  } catch {
    // Fall through
  }

  return NextResponse.json({ success: true });
}

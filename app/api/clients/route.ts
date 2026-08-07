import { NextResponse } from 'next/server';
import { requireOrgAccess, isDemoDeployment } from '@/lib/apiAuth';
import { validateRFC } from '@/lib/rfcValidator';
import { trackServerEvent } from '@/lib/analyticsServer';

/**
 * Client collection.
 *
 * GET swallowed errors into an empty list. POST validated its input properly
 * but, when there was no session or no organization, returned a fabricated
 * `client-<timestamp>` object with a 201 — so the UI showed a client that had
 * never been stored.
 */

export async function GET() {
  if (isDemoDeployment()) {
    return NextResponse.json({ clients: [] });
  }

  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    return NextResponse.json({ clients: clients || [] });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId } = auth.ctx;

  try {
    const body = await request.json();
    const { name, contactName, email, phone, rfc, regimenFiscal, codigoPostal, cfdiUse, notes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'El nombre del cliente es obligatorio' } },
        { status: 400 }
      );
    }

    if (rfc && typeof rfc === 'string' && rfc.trim()) {
      const v = validateRFC(rfc.trim());
      if (!v.isValid) {
        return NextResponse.json(
          { error: { code: 'INVALID_RFC', message: 'El RFC no tiene un formato SAT válido' } },
          { status: 400 }
        );
      }
    }

    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        contact_name: contactName ? String(contactName).trim() : null,
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        rfc: rfc ? String(rfc).toUpperCase().trim() : null,
        regimen_fiscal: regimenFiscal || null,
        codigo_postal: codigoPostal || null,
        cfdi_use: cfdiUse || 'G03',
        notes: notes || null,
        health_score: 100,
      })
      .select()
      .single();

    if (error || !newClient) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo crear el cliente' } },
        { status: 500 }
      );
    }

    // Getting past the empty state. A user who never reaches this step never
    // reaches any of the later ones, so its absence explains a flat funnel.
    trackServerEvent('client_created', {
      distinctId: userId,
      organizationId,
      properties: {
        client_id: newClient.id,
        // Whether the client can be invoiced and reached — the two fields that
        // decide if the rest of the loop is available to them. The values
        // themselves are personal data and stay out.
        has_rfc: Boolean(newClient.rfc),
        has_phone: Boolean(newClient.phone),
      },
    });

    return NextResponse.json(newClient, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al procesar cliente' } },
      { status: 500 }
    );
  }
}

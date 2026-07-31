import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { validateRFC } from '@/lib/rfcValidator';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ clients: [] });
  }

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clients, error } = await (supabase as any)
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && clients) {
      return NextResponse.json({ clients });
    }
  } catch {
    // Fall through to standard payload response
  }

  return NextResponse.json({ clients: [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, contactName, email, phone, rfc, regimenFiscal, codigoPostal, cfdiUse, notes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'El nombre del cliente es obligatorio' } }, { status: 400 });
    }

    if (rfc && typeof rfc === 'string' && rfc.trim()) {
      const v = validateRFC(rfc.trim());
      if (!v.isValid) {
        return NextResponse.json({ error: { code: 'INVALID_RFC', message: 'El RFC no tiene un formato SAT válido' } }, { status: 400 });
      }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Find user org
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      const orgId = orgs && orgs.length > 0 ? orgs[0].id : null;

      if (orgId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newClient, error } = await (supabase as any)
          .from('clients')
          .insert({
            organization_id: orgId,
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

        if (!error && newClient) {
          return NextResponse.json(newClient, { status: 201 });
        }
      }
    }

    // Demo fallback object
    const demoClient = {
      id: `client-${Date.now()}`,
      organization_id: 'org-demo-1',
      name: name.trim(),
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      rfc: rfc ? String(rfc).toUpperCase().trim() : null,
      regimen_fiscal: regimenFiscal || '601',
      codigo_postal: codigoPostal || null,
      cfdi_use: cfdiUse || 'G03',
      notes: notes || null,
      health_score: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(demoClient, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar cliente';
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}

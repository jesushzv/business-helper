import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        organization: {
          id: 'org-demo-1',
          name: 'Distribuidora del Norte',
          rfc: 'DNO850101HD9',
          regimen_fiscal: '601',
          codigo_postal: '64000',
          industry: 'construction',
        },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgs, error } = await (supabase as any)
      .from('organizations')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1);

    if (error || !orgs || orgs.length === 0) {
      return NextResponse.json({
        organization: {
          id: 'org-demo-1',
          name: 'Distribuidora del Norte',
          rfc: 'DNO850101HD9',
          regimen_fiscal: '601',
          codigo_postal: '64000',
          industry: 'construction',
        },
      });
    }

    return NextResponse.json({ organization: orgs[0] });
  } catch {
    return NextResponse.json({
      organization: {
        id: 'org-demo-1',
        name: 'Distribuidora del Norte',
        rfc: 'DNO850101HD9',
        regimen_fiscal: '601',
        codigo_postal: '64000',
        industry: 'construction',
      },
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, rfc, regimenFiscal, codigoPostal, industry } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'El nombre del negocio es obligatorio' } }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('organizations')
        .insert({
          name: name.trim(),
          rfc: rfc ? String(rfc).toUpperCase().trim() : null,
          regimen_fiscal: regimenFiscal || null,
          codigo_postal: codigoPostal || null,
          industry: industry || null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (!error && data) {
        return NextResponse.json({ organization: data });
      }
    }

    // Demo response fallback
    return NextResponse.json({
      organization: {
        id: 'org-demo-1',
        name: name.trim(),
        rfc: rfc ? String(rfc).toUpperCase().trim() : 'DNO850101HD9',
        regimen_fiscal: regimenFiscal || '601',
        codigo_postal: codigoPostal || '64000',
        industry: industry || 'construction',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: msg } }, { status: 500 });
  }
}

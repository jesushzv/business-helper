import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET() {
  if (!isSupabaseConfigured()) {
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

/**
 * Updates the organization's SPEI settlement account.
 *
 * The public payment page reads these values per quote; until an org sets them
 * it has no CLABE and that page refuses to render payment instructions rather
 * than falling back to a shared account (the previous behaviour).
 *
 * Unlike GET/POST above, this handler does not fall back to demo data when
 * unauthenticated — it is a write to a money-routing field, so an absent or
 * non-owning caller is rejected outright.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { bankName, bankClabe, bankAccountHolder } = body;

    const clabe = typeof bankClabe === 'string' ? bankClabe.replace(/\s/g, '') : '';

    if (!/^\d{18}$/.test(clabe)) {
      return NextResponse.json(
        { error: { code: 'INVALID_CLABE', message: 'La CLABE debe tener exactamente 18 dígitos' } },
        { status: 400 }
      );
    }

    if (!bankName || typeof bankName !== 'string' || !bankName.trim()) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'El nombre del banco es obligatorio' } },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } },
        { status: 401 }
      );
    }

    // Scope the write to an org this user owns. Without the owner_id filter the
    // organization id would be caller-supplied and any tenant could redirect
    // another tenant's incoming payments.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organizations')
      .update({
        bank_name: bankName.trim(),
        bank_clabe: clabe,
        bank_account_holder:
          typeof bankAccountHolder === 'string' && bankAccountHolder.trim()
            ? bankAccountHolder.trim()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', user.id)
      .select('id, name, bank_name, bank_clabe, bank_account_holder')
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar la cuenta bancaria' } },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No se encontró una organización propia' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ organization: data });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno' } },
      { status: 500 }
    );
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

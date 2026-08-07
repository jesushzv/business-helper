import { NextResponse } from 'next/server';
import { requireOrgAccess, requireUser, isDemoDeployment } from '@/lib/apiAuth';
import { normalizeClabe, isValidClabeLength } from '@/lib/clabe';

export async function GET() {
  // No backend means no tenant data; the demo organization is honest here.
  if (isDemoDeployment()) {
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

  // Previously fell back to the same demo organization for unauthenticated
  // callers and on any error, so a caller could not tell a real tenant from a
  // placeholder — and an anonymous request always got a 200.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: organization, error } = await (supabase as any)
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !organization) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Organización no encontrada' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ organization });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al obtener la organización' } },
      { status: 500 }
    );
  }
}

/**
 * Updates the organization's SPEI settlement account.
 *
 * The public payment page reads these values per quote; until an org sets them
 * it has no CLABE and that page refuses to render payment instructions rather
 * than falling back to a shared account (the previous behaviour).
 *
 * Scoped to an organization the caller owns: without the owner_id filter the
 * target would effectively be caller-supplied, letting one tenant redirect
 * another tenant's incoming payments.
 */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { bankName, bankClabe, bankAccountHolder } = body;

    const clabe = typeof bankClabe === 'string' ? normalizeClabe(bankClabe) : '';

    if (!isValidClabeLength(clabe)) {
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
      .eq('owner_id', userId)
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

/**
 * Creates an organization owned by the caller.
 *
 * Uses requireUser rather than requireOrgAccess: this is how a user gets their
 * first organization, so not having one yet is the normal case.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { name, rfc, regimenFiscal, codigoPostal, industry } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'El nombre del negocio es obligatorio' } }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organizations')
      .insert({
        name: name.trim(),
        rfc: rfc ? String(rfc).toUpperCase().trim() : null,
        regimen_fiscal: regimenFiscal || null,
        codigo_postal: codigoPostal || null,
        industry: industry || null,
        owner_id: userId,
      })
      .select()
      .single();

    // Previously fell through to a fabricated 'org-demo-1' response on failure
    // or without a session, so onboarding appeared to succeed while creating
    // nothing.
    if (error || !data) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo crear la organización' } },
        { status: 500 }
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

import { NextResponse } from 'next/server';
import { requireOrgAccess, requireUser, isDemoDeployment } from '@/lib/apiAuth';
import { normalizeClabe, isValidClabeLength, hasValidClabeCheckDigit } from '@/lib/clabe';
import { validateRFC } from '@/lib/rfcValidator';
import { normalizeClientPhone } from '@/lib/phoneValidator';

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
      role: 'owner',
    });
  }

  // Previously fell back to the same demo organization for unauthenticated
  // callers and on any error, so a caller could not tell a real tenant from a
  // placeholder — and an anonymous request always got a 200.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

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

    // The caller's role travels with the organization so the settlement-account
    // banner can address the right person (#64): only an owner can PATCH this
    // row — the update is scoped by `owner_id` — so pointing a member at the
    // bank form would send them somewhere they cannot save.
    return NextResponse.json({ organization, role });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al obtener la organización' } },
      { status: 500 }
    );
  }
}

/**
 * Updates the organization's profile and/or SPEI settlement account.
 *
 * Two payload families, validated independently so a profile save is never
 * rejected for a missing CLABE and a bank save keeps its exact prior contract:
 * - bank: `bankName`, `bankClabe`, `bankAccountHolder` (all-or-nothing, as before)
 * - profile: `name`, `rfc`, `regimenFiscal`, `codigoPostal`, `phone`, `logoUrl`
 *   (each optional; only provided keys are written) — added for #95, which found
 *   the settings page saving with a PUT this route never implemented.
 *
 * The public payment page reads the bank values per quote; until an org sets
 * them it has no CLABE and that page refuses to render payment instructions
 * rather than falling back to a shared account (the previous behaviour).
 *
 * Scoped to an organization the caller owns: without the owner_id filter the
 * target would effectively be caller-supplied, letting one tenant redirect
 * another tenant's incoming payments (and the profile fields feed CFDI 4.0
 * stamping, so they get the same protection).
 */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { bankName, bankClabe, bankAccountHolder } = body;

    const update: Record<string, unknown> = {};

    const hasBankPayload =
      bankName !== undefined || bankClabe !== undefined || bankAccountHolder !== undefined;

    if (hasBankPayload) {
      const clabe = typeof bankClabe === 'string' ? normalizeClabe(bankClabe) : '';

      if (!isValidClabeLength(clabe)) {
        return NextResponse.json(
          { error: { code: 'INVALID_CLABE', message: 'La CLABE debe tener exactamente 18 dígitos' } },
          { status: 400 }
        );
      }

      // Enforced server-side since #66 (decided 2026-08-08): this is the
      // account a tenant's clients wire real money to, and the checksum
      // catches the transposition and single-digit typos a length check
      // cannot. Rejecting here beats a misdirected SPEI transfer later.
      if (!hasValidClabeCheckDigit(clabe)) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_CLABE',
              message:
                'La CLABE no parece válida. Revísala dígito por dígito tal como aparece en tu banco.',
            },
          },
          { status: 400 }
        );
      }

      if (!bankName || typeof bankName !== 'string' || !bankName.trim()) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El nombre del banco es obligatorio' } },
          { status: 400 }
        );
      }

      update.bank_name = bankName.trim();
      update.bank_clabe = clabe;
      update.bank_account_holder =
        typeof bankAccountHolder === 'string' && bankAccountHolder.trim()
          ? bankAccountHolder.trim()
          : null;
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El nombre del negocio es obligatorio' } },
          { status: 400 }
        );
      }
      update.name = body.name.trim();
    }

    if (body.rfc !== undefined) {
      const rfc = typeof body.rfc === 'string' ? body.rfc.trim().toUpperCase() : '';
      if (rfc) {
        const check = validateRFC(rfc);
        if (!check.isValid) {
          return NextResponse.json(
            { error: { code: 'INVALID_RFC', message: check.error || 'El RFC no es válido' } },
            { status: 400 }
          );
        }
        update.rfc = rfc;
      } else {
        update.rfc = null;
      }
    }

    if (body.regimenFiscal !== undefined) {
      // Stored as the SAT code; old clients sent display labels like
      // '601 — General de Ley Personas Morales'. A non-empty value that yields
      // no code is a 400, not a silent NULL — this field feeds CFDI 4.0.
      const raw = typeof body.regimenFiscal === 'string' ? body.regimenFiscal.trim() : '';
      // Exactly three digits, alone or followed by a label separator — a
      // boundary-less match would silently truncate '6012' to a different code.
      const code = /^(\d{3})(?:\s*[—–-]|$)/.exec(raw);
      if (raw && !code) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El régimen fiscal no es válido' } },
          { status: 400 }
        );
      }
      update.regimen_fiscal = code ? code[1] : null;
    }

    if (body.codigoPostal !== undefined) {
      const cp = typeof body.codigoPostal === 'string' ? body.codigoPostal.trim() : '';
      if (cp && !/^\d{5}$/.test(cp)) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El código postal debe tener 5 dígitos' } },
          { status: 400 }
        );
      }
      update.codigo_postal = cp || null;
    }

    if (body.phone !== undefined) {
      const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (raw) {
        const normalized = normalizeClientPhone(raw);
        if (normalized.error || !normalized.value) {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_PHONE',
                message:
                  'El teléfono de contacto debe ser un número mexicano de 10 dígitos, por ejemplo 8112345678.',
              },
            },
            { status: 400 }
          );
        }
        update.phone = normalized.value;
      } else {
        update.phone = null;
      }
    }

    if (body.logoUrl !== undefined) {
      const logo = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : '';
      // https only: the logo renders on client-facing pages, so an arbitrary
      // scheme (javascript:) or plain-http origin is not acceptable there.
      if (logo && !/^https:\/\//i.test(logo)) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'La URL del logotipo debe comenzar con https://' } },
          { status: 400 }
        );
      }
      update.logo_url = logo || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'No hay datos que guardar' } },
        { status: 400 }
      );
    }

    update.updated_at = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organizations')
      .update(update)
      .eq('owner_id', userId)
      // Explicit list on purpose: this table is growing CFDI/billing columns,
      // and a `*` here would ship any future sensitive column to the browser
      // without a diff to review.
      .select(
        'id, name, rfc, regimen_fiscal, codigo_postal, phone, logo_url, subscription_tier, subscription_status, bank_name, bank_clabe, bank_account_holder'
      )
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

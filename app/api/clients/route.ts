import { NextResponse } from 'next/server';
import {
  requireOrgAccess,
  isDemoDeployment,
  pickFields,
  validateCreditTerms,
  CLIENT_WRITABLE_FIELDS,
} from '@/lib/apiAuth';
import { validateRFC } from '@/lib/rfcValidator';
import { normalizeClientPhone } from '@/lib/phoneValidator';

/**
 * Client collection.
 *
 * GET swallowed errors into an empty list. POST validated its input properly
 * but, when there was no session or no organization, returned a fabricated
 * `client-<timestamp>` object with a 201 — so the UI showed a client that had
 * never been stored.
 *
 * The body is read through `pickFields` like the quotes and receivables routes,
 * rather than hand-destructured. The destructuring named camelCase keys
 * (`contactName`, `regimenFiscal`, `codigoPostal`, `cfdiUse`) that the only
 * caller never sends — it sends the column names — so all four silently
 * resolved to undefined and were written as null while the UI reported the
 * client saved. `regimen_fiscal` and `codigo_postal` are required to stamp a
 * CFDI, so a client created through the form could never be invoiced (#96
 * verification).
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
  const { supabase, organizationId } = auth.ctx;

  try {
    const body = await request.json();
    const fields = pickFields<Record<string, unknown>>(body, CLIENT_WRITABLE_FIELDS);
    const { name, rfc, phone } = fields as {
      name?: unknown;
      rfc?: unknown;
      phone?: unknown;
    };

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

    const credit = validateCreditTerms(fields);
    if (!credit.ok) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDIT_TERMS', message: credit.message } },
        { status: 400 }
      );
    }

    // The phone is what a signature is later delivered to, so an unusable
    // value must not reach the column. This route used to only `.trim()`, so
    // "llamar a la oficina", a 7-digit local number or an extension persisted
    // happily and surfaced much later as a 502 from the OTP route, blaming the
    // provider for a value entered here (#40). Stored normalized to 10 digits
    // so downstream E.164 formatting is deterministic.
    const phoneNormalized = normalizeClientPhone(phone);
    if (phoneNormalized.error) {
      return NextResponse.json(
        { error: { code: 'INVALID_PHONE', message: phoneNormalized.error } },
        { status: 400 }
      );
    }

    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        ...fields,
        organization_id: organizationId,
        name: name.trim(),
        phone: phoneNormalized.value,
        rfc: rfc ? String(rfc).toUpperCase().trim() : null,
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

    return NextResponse.json(newClient, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al procesar cliente' } },
      { status: 500 }
    );
  }
}

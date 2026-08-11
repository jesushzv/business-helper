import { NextResponse } from 'next/server';
import {
  requireOrgAccess,
  isDemoDeployment,
  pickFields,
  CLIENT_WRITABLE_FIELDS,
} from '@/lib/apiAuth';
import {
  validateClientWrite,
  summarizeFieldErrors,
  fieldErrorCode,
} from '@/lib/clientValidation';
import { describeDbWriteError } from '@/lib/dbWriteError';

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
 *
 * Validation reports **every** bad field at once, keyed by column, through
 * `error.fields`. Returning on the first failure made registering a client an
 * interrogation: fix the name, resubmit, learn about the phone, resubmit, learn
 * about the crédito — with no indication on screen of which input each message
 * meant. The RFC no longer takes part in it at all; it is optional here and is
 * enforced where it matters, at CFDI stamping.
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

    // The phone is what a signature is later delivered to, so an unusable value
    // must not reach the column — "llamar a la oficina", a 7-digit local number
    // or an extension used to persist happily and surface much later as a 502
    // from the OTP route, blaming the provider for a value entered here (#40).
    // That check, the credit terms and the rest now run together so the tenant
    // sees the whole list once.
    const { fieldErrors, values } = validateClientWrite(fields, { requireName: true });
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

    // An explicit null would override the column's 'G03' default; omitting the
    // key lets the default apply. cfdi_use feeds CFDI stamping, so a NULL here
    // resurfaces later as an invoice that cannot be issued.
    if (fields.cfdi_use === null) delete fields.cfdi_use;

    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        ...fields,
        ...values,
        organization_id: organizationId,
        health_score: 100,
      })
      .select()
      .single();

    if (error || !newClient) {
      // Not one opaque 500 for every cause. A missing column, a CHECK the value
      // tripped and a permission denial each get their own Spanish answer, and
      // the raw error is logged rather than discarded.
      const failure = describeDbWriteError(error, 'el cliente', 'POST /api/clients');
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

    return NextResponse.json(newClient, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error al procesar cliente' } },
      { status: 500 }
    );
  }
}

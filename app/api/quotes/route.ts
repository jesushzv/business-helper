import { NextResponse } from 'next/server';
import {
  requireOrgAccess,
  isDemoDeployment,
  pickFields,
  QUOTE_WRITABLE_FIELDS,
} from '@/lib/apiAuth';
import { readOrganizationTrialState } from '@/lib/organizationTrialGate';
import { TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE } from '@/lib/subscriptionTrial';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';

/**
 * Quote collection.
 *
 * GET listed every quote the query could reach and returned `{quotes: []}` on
 * any error, so a failure was indistinguishable from an empty tenant. POST
 * checked for a user but fell through to echoing the caller's body back with a
 * 201 when there was none, and spread that body into the insert.
 */

export async function GET() {
  // With no backend there is no tenant data; an empty list is the honest answer.
  if (isDemoDeployment()) {
    return NextResponse.json({ quotes: [] });
  }

  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar tus cotizaciones' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ quotes: quotes || [] });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar tus cotizaciones' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, userId, organizationId } = auth.ctx;

  try {
    const body = await request.json();
    const fields = pickFields(body, QUOTE_WRITABLE_FIELDS);

    if (!fields.title) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'El título es obligatorio' } },
        { status: 400 }
      );
    }

    // The trial gate (#128). Starting *new* work
    // stops when the trial ends; everything already in flight keeps running —
    // quotes already sent can still be signed and paid, payments still confirm,
    // and a client mid-signature is never blocked by their supplier's billing.
    // Contract conversion, CFDI stamping, complementos and outbound reminders
    // gate alongside this one, on the founder's decision; confirming a payment,
    // uploading a receipt and cancelling a wrong CFDI do not.
    //
    // It does not fire at all until this deployment can actually take a payment
    // (#68): a paywall with no way through is a dead end, not a forcing
    // function. `readOrganizationTrialState` answers "unknown" — and so does not
    // gate — for any read it could not complete.
    const trial = await readOrganizationTrialState(supabase, organizationId);
    if (trial.blocksNewWork) {
      return NextResponse.json(
        {
          error: {
            code: TRIAL_EXPIRED_CODE,
            message: TRIAL_EXPIRED_MESSAGE,
            trial_ended_at: trial.endsAt,
          },
        },
        { status: 402 }
      );
    }

    // organization_id and created_by come from the session, never the body, so
    // a caller cannot plant a quote in another tenant.
    const { data: newQuote, error } = await supabase
      .from('quotes')
      .insert({
        ...fields,
        organization_id: organizationId,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !newQuote) {
      return dbWriteErrorResponse(error, 'la cotización', 'POST /api/quotes', { verb: 'crear' });
    }

    return NextResponse.json(newQuote, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo crear la cotización' } },
      { status: 500 }
    );
  }
}

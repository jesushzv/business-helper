import { NextResponse } from 'next/server';
import { readOrganizationTrialState } from '@/lib/organizationTrialGate';
import { TRIAL_EXPIRED_CODE, TRIAL_EXPIRED_MESSAGE } from '@/lib/subscriptionTrial';
import { requireOrgAccess } from '@/lib/apiAuth';
import { convertQuoteToContract } from '@/lib/quoteToContract';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { captureException } from '@/lib/sentry';
import { track } from '@/lib/analytics';

/**
 * Converts an accepted quote into a contract with its milestones.
 *
 * Ran unauthenticated and unscoped. When the quote lookup found nothing it
 * invented a 50,000 MXN "Cotización Demo", converted that, and returned the
 * result with a 201 — so a caller received a contract and payment schedule that
 * existed nowhere in the database.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId } = auth.ctx;

    // #128 — the trial gate. Extended past quote creation on the founder's
    // decision: the states blocked are "no new quotes, contracts or CFDI", and
    // reminders. Stamping for work already closed was argued the other way in
    // this PR's original scope; the call taken is that issuing a fiscal document
    // is starting something, while *collecting* on one already issued is not —
    // so payment confirmation, uploads and cancellation stay open, and this does
    // not.
    //
    // Permissive on unknown, like the quotes route: readOrganizationTrialState
    // answers "unknown" for any read it could not complete, and unknown never
    // gates.
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


  try {
    const { id } = await params;

    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!quote) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cotización no encontrada' } },
        { status: 404 }
      );
    }

    if (quote.converted_contract_id) {
      return NextResponse.json(
        { error: { code: 'ALREADY_CONVERTED', message: 'Esta cotización ya fue convertida' } },
        { status: 409 }
      );
    }

    const conversion = convertQuoteToContract(quote);

    // The rows carry no `id`, `created_at` or `contract_id` — Postgres owns
    // those. The fabricated `c_…` text ids this inserted before failed every
    // conversion with 22P02 against the uuid columns, and the discarded error
    // kept the cause out of Sentry and off the screen (#214).
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      // Pin the tenant from the session rather than whatever the conversion
      // helper derived from the row.
      .insert({ ...conversion.contract, organization_id: organizationId })
      .select()
      .single();

    if (contractError || !newContract) {
      return dbWriteErrorResponse(contractError, 'el contrato', 'quotes/convert', { verb: 'crear' });
    }

    const { data: newMilestones, error: milestoneError } = await supabase
      .from('milestones')
      .insert(
        conversion.milestones.map((m) => ({
          ...m,
          contract_id: newContract.id,
          organization_id: organizationId,
        }))
      )
      .select();

    if (milestoneError) {
      // A contract with no payment schedule is worse than no contract, and
      // there is no transaction spanning these inserts — roll back by hand.
      const { error: rollbackError } = await supabase
        .from('contracts')
        .delete()
        .eq('id', newContract.id);
      if (rollbackError) {
        // The orphaned contract holds `quote_id`, whose UNIQUE constraint will
        // 409 every retry — without this log that dead-end has no diagnosis.
        captureException(rollbackError, {
          route: 'quotes/convert',
          organization_id: organizationId,
          level: 'error',
          tags: { db_error_code: String(rollbackError.code || 'unknown'), step: 'rollback' },
          extra: { contract_id: newContract.id, details: rollbackError.details },
        });
      }
      return dbWriteErrorResponse(milestoneError, 'los cobros programados', 'quotes/convert', {
        verb: 'crear',
      });
    }

    const { error: quoteStatusError } = await supabase
      .from('quotes')
      .update({ status: 'converted', converted_contract_id: newContract.id })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (quoteStatusError) {
      // Partial success — the contract and milestones exist — so the specific
      // code survives; the cause goes to the log instead of nowhere.
      captureException(quoteStatusError, {
        route: 'quotes/convert',
        organization_id: organizationId,
        level: 'error',
        // formatErrorPayload keeps only message/stack — the PostgREST fields
        // that actually diagnose the failure travel as extra, like
        // describeDbWriteError's own capture does.
        tags: { db_error_code: String(quoteStatusError.code || 'unknown') },
        extra: { details: quoteStatusError.details, hint: quoteStatusError.hint },
      });
      return NextResponse.json(
        {
          error: {
            code: 'QUOTE_STATUS_NOT_UPDATED',
            message: 'Se creó el contrato pero no se pudo actualizar el estado de la cotización',
          },
        },
        { status: 500 }
      );
    }

    track(
      'quote_converted',
      {
        organization_id: organizationId,
        quote_id: id,
        milestone_count: newMilestones?.length ?? 0,
      },
      { distinctId: userId }
    );

    return NextResponse.json({ contract: newContract, milestones: newMilestones }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
      { status: 500 }
    );
  }
}

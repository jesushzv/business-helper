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
 *
 * Deliberately NOT gated by a capability: any organization member may convert
 * (the founder's call on #217), so the absence of `hasCapability()` here is a
 * decision, not the #32 defect. Likewise the route does not require
 * `quote.status === 'accepted'`: the contract's own status derives from the
 * OTP evidence in `convertQuoteToContract`, so an unsigned quote yields a
 * draft contract, never a claimed signature.
 */
/**
 * The conversion's own schedule for a contract — manual cobros excluded.
 *
 * `POST /api/receivables` can attach a tenant-authored cobro to any contract,
 * including a partial-conversion orphan; counting those rows as "the schedule
 * already exists" would flip the quote while the anticipo/liquidación were
 * never created. `conversion_position` is the discriminator: only rows the
 * conversion inserted carry one. Ordered so the response is deterministic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readConversionSchedule(supabase: any, contractId: string, organizationId: string) {
  return supabase
    .from('milestones')
    .select('*')
    .eq('contract_id', contractId)
    .eq('organization_id', organizationId)
    .not('conversion_position', 'is', null)
    .order('conversion_position');
}

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

    // #218 — resume before inserting. Two partial failures leave a contract
    // for this quote while the quote still reads unconverted: a milestone
    // insert whose hand-rolled rollback also failed (an orphan with no
    // schedule), and a full conversion whose quote update failed. Since
    // `contracts.quote_id` is UNIQUE, a blind re-insert answers every retry
    // with a misleading 409 «Ya existe…» forever; the honest move is to finish
    // what exists.
    const { data: existingContract, error: resumeLookupError } = await supabase
      .from('contracts')
      .select('*')
      .eq('quote_id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (resumeLookupError) {
      // Proceeding blind would end in the 23505 dead-end this lookup exists to
      // prevent — refuse now, with the cause in the log.
      captureException(resumeLookupError, {
        route: 'quotes/convert',
        organization_id: organizationId,
        level: 'error',
        tags: { db_error_code: String(resumeLookupError.code || 'unknown'), step: 'resume-lookup' },
        extra: { details: resumeLookupError.details, hint: resumeLookupError.hint },
      });
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
        { status: 500 }
      );
    }

    let resumed = Boolean(existingContract);
    let contract = existingContract;

    // A resumed contract may already carry its schedule (the only missing step
    // was the quote update) — reuse it rather than doubling the receivable.
    let milestones = null;
    if (contract) {
      const { data: existingMilestones, error: milestoneLookupError } =
        await readConversionSchedule(supabase, contract.id, organizationId);

      if (milestoneLookupError) {
        captureException(milestoneLookupError, {
          route: 'quotes/convert',
          organization_id: organizationId,
          level: 'error',
          tags: {
            db_error_code: String(milestoneLookupError.code || 'unknown'),
            step: 'resume-milestones',
          },
          extra: { contract_id: contract.id, details: milestoneLookupError.details },
        });
        return NextResponse.json(
          { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
          { status: 500 }
        );
      }
      if (existingMilestones && existingMilestones.length > 0) {
        milestones = existingMilestones;
      }

      // The quote stays editable while unconverted, so the contract found here
      // may be a snapshot of a quote that has since changed (#222). Healing
      // silently would marry current-quote milestones to stale contract
      // totals — or present a stale conversion as the result of this request.
      const stale =
        Number(contract.total_amount) !== conversion.contract.total_amount ||
        contract.client_id !== conversion.contract.client_id;

      if (stale && milestones) {
        // The conversion completed against the old quote; only the status flip
        // was missing. Refusing names the real situation instead of flipping
        // an edited quote onto a contract with different numbers.
        return NextResponse.json(
          {
            error: {
              code: 'CONVERTED_QUOTE_MODIFIED',
              message:
                'La cotización fue modificada después de que se creó su contrato. ' +
                'Revisa el contrato en Cobranza antes de continuar.',
            },
          },
          { status: 409 }
        );
      }

      if (stale) {
        // A stale orphan: no milestones reference it, so recreate it from the
        // quote as it reads today.
        const { error: staleDeleteError } = await supabase
          .from('contracts')
          .delete()
          .eq('id', contract.id)
          .eq('organization_id', organizationId);
        if (staleDeleteError) {
          captureException(staleDeleteError, {
            route: 'quotes/convert',
            organization_id: organizationId,
            level: 'error',
            tags: {
              db_error_code: String(staleDeleteError.code || 'unknown'),
              step: 'stale-orphan-delete',
            },
            extra: { contract_id: contract.id, details: staleDeleteError.details },
          });
          return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
            { status: 500 }
          );
        }
        contract = null;
        resumed = false;
      }
    }

    if (!contract) {
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
        // 23505 on `contracts.quote_id` is a concurrent twin of this request
        // winning the contract insert — a double-tap, not a duplicate. The
        // twin read the same quote milliseconds ago, so its contract is not
        // stale; resume onto it instead of reporting an error for a
        // conversion that succeeded.
        if (contractError?.code === '23505') {
          const { data: twinContract } = await supabase
            .from('contracts')
            .select('*')
            .eq('quote_id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (twinContract) {
            const { data: twinSchedule } = await readConversionSchedule(
              supabase,
              twinContract.id,
              organizationId
            );
            contract = twinContract;
            resumed = true;
            if (twinSchedule && twinSchedule.length > 0) {
              milestones = twinSchedule;
            }
          }
        }
        if (!contract) {
          return dbWriteErrorResponse(contractError, 'el contrato', 'quotes/convert', {
            verb: 'crear',
          });
        }
      } else {
        contract = newContract;
      }
    }

    if (!milestones) {
      const { data: newMilestones, error: milestoneError } = await supabase
        .from('milestones')
        .insert(
          conversion.milestones.map((m) => ({
            ...m,
            contract_id: contract.id,
            organization_id: organizationId,
          }))
        )
        .select();

      if (milestoneError) {
        // A failed insert here is not necessarily a failed conversion: on
        // 23505 (`uq_milestones_contract_conversion_position`) a concurrent
        // twin inserted the schedule first, and even on other failures the
        // twin may have succeeded in between. Read the schedule back before
        // concluding anything — if it exists, this is a success wearing an
        // error, and rolling the contract back would cascade the twin's
        // schedule away (`milestones.contract_id` is ON DELETE CASCADE).
        const { data: twinMilestones, error: twinReadError } = await readConversionSchedule(
          supabase,
          contract.id,
          organizationId
        );
        if (!twinReadError && twinMilestones && twinMilestones.length > 0) {
          milestones = twinMilestones;
        }

        if (!milestones) {
          // A contract with no payment schedule is worse than no contract, and
          // there is no transaction spanning these inserts — roll back by hand.
          // Only a contract this request created: deleting a resumed orphan
          // would just re-create the state a later retry heals from.
          if (!resumed) {
            const { error: rollbackError } = await supabase
              .from('contracts')
              .delete()
              .eq('id', contract.id)
              .eq('organization_id', organizationId);
            if (rollbackError) {
              // The orphaned contract holds `quote_id`, whose UNIQUE constraint
              // would 409 every blind retry — logged so the dead-end has a
              // diagnosis, healed by the resume lookup above.
              captureException(rollbackError, {
                route: 'quotes/convert',
                organization_id: organizationId,
                level: 'error',
                tags: { db_error_code: String(rollbackError.code || 'unknown'), step: 'rollback' },
                extra: { contract_id: contract.id, details: rollbackError.details },
              });
            }
          }
          return dbWriteErrorResponse(milestoneError, 'los cobros programados', 'quotes/convert', {
            verb: 'crear',
          });
        }
      } else {
        milestones = newMilestones;
      }
    }

    const { error: quoteStatusError } = await supabase
      .from('quotes')
      .update({ status: 'converted', converted_contract_id: contract.id })
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
        milestone_count: milestones?.length ?? 0,
        resumed,
      },
      { distinctId: userId }
    );

    // 200 on a resume: nothing was created that did not already exist.
    return NextResponse.json({ contract, milestones }, { status: resumed ? 200 : 201 });
  } catch (err) {
    // A silent catch here is the thrown-away-diagnosis defect (#146) this
    // route keeps re-learning — the cause goes to the log.
    captureException(err, { route: 'quotes/convert', organization_id: organizationId, level: 'error' });
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
      { status: 500 }
    );
  }
}

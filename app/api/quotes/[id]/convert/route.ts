import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { convertQuoteToContract } from '@/lib/quoteToContract';
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

    const { data: newContract, error: contractErr } = await supabase
      .from('contracts')
      // Pin the tenant from the session rather than whatever the conversion
      // helper derived from the row.
      .insert({ ...conversion.contract, organization_id: organizationId })
      .select()
      .single();

    if (contractErr || !newContract) {
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' } },
        { status: 500 }
      );
    }

    const { data: newMilestones, error: milestoneErr } = await supabase
      .from('milestones')
      .insert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversion.milestones.map((m: any) => ({
          ...m,
          contract_id: newContract.id,
          organization_id: organizationId,
        }))
      )
      .select();

    if (milestoneErr) {
      // A contract with no payment schedule is worse than no contract, and
      // there is no transaction spanning these inserts — roll back by hand.
      await supabase.from('contracts').delete().eq('id', newContract.id);
      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'No se pudieron crear los hitos de cobranza' } },
        { status: 500 }
      );
    }

    const { error: quoteErr } = await supabase
      .from('quotes')
      .update({ status: 'converted', converted_contract_id: newContract.id })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (quoteErr) {
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

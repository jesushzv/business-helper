import { NextResponse } from 'next/server';
import {
  requireOrgAccess,
  isDemoDeployment,
  pickFields,
  MILESTONE_WRITABLE_FIELDS,
} from '@/lib/apiAuth';

/**
 * Milestone (receivables) collection.
 *
 * GET returned `{receivables: []}` on error, hiding failures as empty results.
 * POST fell through to echoing the caller's body back with a 201 when there was
 * no session, and spread that body into the insert.
 */

export async function GET() {
  if (isDemoDeployment()) {
    return NextResponse.json({ receivables: [] });
  }

  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    // The complements are embedded rather than fetched per row: a PPD invoice
    // owes one per payment, and the invoicing screen has to be able to say
    // which cobros still owe the SAT a document without N extra requests.
    const { data: receivables, error } = await supabase
      .from('milestones')
      .select(
        '*, contracts(*, clients(*)), ' +
          'cfdi_payment_complements(id, installment, amount, last_balance, remaining_balance, ' +
          'status, cfdi_uuid, cfdi_xml_path, cfdi_pdf_path, payment_date, error)'
      )
      .eq('organization_id', organizationId)
      .order('due_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 });
    }

    return NextResponse.json({ receivables: receivables || [] });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const body = await request.json();
    const fields = pickFields(body, MILESTONE_WRITABLE_FIELDS);

    // contract_id is a relationship, not a free-form field, so it is validated
    // against the caller's own contracts rather than trusted from the body.
    const contractId = typeof body?.contract_id === 'string' ? body.contract_id : null;

    if (!contractId) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'contract_id es obligatorio' } },
        { status: 400 }
      );
    }

    const { data: contract } = await supabase
      .from('contracts')
      .select('id')
      .eq('id', contractId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!contract) {
      return NextResponse.json(
        { error: { code: 'CONTRACT_NOT_FOUND', message: 'Contrato no encontrado' } },
        { status: 404 }
      );
    }

    const { data: newMilestone, error } = await supabase
      .from('milestones')
      .insert({
        ...fields,
        contract_id: contractId,
        organization_id: organizationId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !newMilestone) {
      return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
    }

    return NextResponse.json(newMilestone, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}

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
    // `quotes` is embedded through the contract because the payment page keys
    // on the quote's public_token: /pay/[token] resolves a quote and walks to
    // its contract and milestones. Without it every share action on Cobranza
    // and Facturación had no token to build a link from (#72).
    //
    // The `!quote_id` hint is required, not decoration: quotes and contracts
    // are joined by two foreign keys — contracts.quote_id and
    // quotes.converted_contract_id (`fk_quotes_converted_contract`) — and an
    // unhinted embed between them is ambiguous (PostgREST PGRST201).
    //
    // Hinted by FK *column*, not constraint name: `quote_id` is written down in
    // the migration and in types/database.ts, whereas the constraint name is
    // whatever Postgres auto-generated for an inline REFERENCES.
    const { data: receivables, error } = await supabase
      .from('milestones')
      .select(
        // `quotes!quote_id` and `bank_accounts!bank_account_id` are both hinted
        // by FK column, per the rule #79 earned. The account the quote named
        // travels with it so Cobranza can tell that this quote's payment page
        // refuses, which the organization-level readiness gate cannot (#164).
        '*, contracts(*, clients(*), quotes!quote_id(public_token, bank_account_id, ' +
          'bank_accounts!bank_account_id(archived_at))), ' +
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

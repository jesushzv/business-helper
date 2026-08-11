import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { BANK_ACCOUNT_COLUMNS, validateBankAccount, type BankAccount } from '@/lib/bankAccounts';
import { captureException } from '@/lib/sentry';
import { describeDbWriteError } from '@/lib/dbWriteError';

/**
 * The organization's settlement accounts (#164).
 *
 * Replaces the single `organizations.bank_*` triple. Writes are owner-only:
 * this is where every SPEI a tenant receives lands, so it gets the same
 * treatment as the PAC credentials rather than plain membership.
 */

function fieldError(field: string, message: string, status = 400): NextResponse {
  return NextResponse.json({ error: { code: 'INVALID_INPUT', message, field } }, { status });
}

export async function GET() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  const { data, error } = await supabase
    .from('bank_accounts')
    .select(BANK_ACCOUNT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('is_default', { ascending: false })
    .order('label', { ascending: true });

  if (error) {
    // A failed read is unknown, not "no accounts" — the caller's tri-state
    // depends on telling those apart (#64/#96).
    captureException(error, { route: 'GET /api/organization/bank-accounts', organization_id: organizationId });
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar tus cuentas de cobro' } },
      { status: 500 }
    );
  }

  // `role` travels with the list so the settings card can address the person
  // who can actually act: only an owner may write these.
  return NextResponse.json({ accounts: (data as BankAccount[]) ?? [], role });
}

export async function POST(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'billing_management')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Solo el dueño de la cuenta puede agregar cuentas de cobro.',
        },
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const validated = validateBankAccount(body);
    if (!validated.ok) return fieldError(validated.field, validated.message);

    // First account for this organization becomes the default: a tenant with
    // exactly one account should never be in the "nothing is default" state
    // that leaves quotes resolving to nothing.
    const { count, error: countError } = await supabase
      .from('bank_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('archived_at', null);

    if (countError) {
      const failure = describeDbWriteError(countError, 'la cuenta de cobro', 'POST /api/organization/bank-accounts');
      return NextResponse.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status }
      );
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({
        organization_id: organizationId,
        ...validated.value,
        is_default: (count ?? 0) === 0,
      })
      .select(BANK_ACCOUNT_COLUMNS)
      .single();

    if (error || !data) {
      const failure = describeDbWriteError(error, 'la cuenta de cobro', 'POST /api/organization/bank-accounts');
      return NextResponse.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status }
      );
    }

    return NextResponse.json({ account: data as BankAccount });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno' } },
      { status: 500 }
    );
  }
}

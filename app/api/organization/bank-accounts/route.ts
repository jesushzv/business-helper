import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import {
  BANK_ACCOUNT_COLUMNS,
  mapAccountQuoteExposure,
  validateBankAccount,
  type BankAccount,
  type BankAccountValidation,
} from '@/lib/bankAccounts';
import { captureException } from '@/lib/sentry';
import { describeDbWriteError } from '@/lib/dbWriteError';

/**
 * The organization's settlement accounts (#164).
 *
 * Replaces the single `organizations.bank_*` triple. Writes are owner-only:
 * this is where every SPEI a tenant receives lands, so it gets the same
 * treatment as the PAC credentials rather than plain membership.
 */

/**
 * `fields` carries every problem at once so the form can pin each message under
 * the input it names; `field`/`message` repeat the first for a caller with one
 * slot. Validation reveals the whole form's state per submit, not one problem
 * per round trip (#146).
 */
function fieldError(validation: Extract<BankAccountValidation, { ok: false }>): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'INVALID_INPUT',
        message: validation.message,
        field: validation.field,
        fields: validation.fields,
      },
    },
    { status: 400 }
  );
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

  // Which live quotes settle at each account (#196/#197): the archive
  // confirmation and the CLABE edit warn with these facts. `null` (the read
  // failed) travels as-is — the card falls back to generic wording rather
  // than rendering an invented zero.
  const exposure = await mapAccountQuoteExposure(supabase, organizationId);
  const accounts = ((data as BankAccount[]) ?? []).map((account) => ({
    ...account,
    live_quotes: exposure ? (exposure[account.id] ?? { count: 0, client_names: [] }) : null,
  }));

  // `role` travels with the list so the settings card can address the person
  // who can actually act: only an owner may write these.
  return NextResponse.json({ accounts, role });
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
    if (!validated.ok) return fieldError(validated);

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

    // Adding an account is how money starts arriving somewhere new. Audited
    // like the archive and the default switch, best-effort and after the row is
    // confirmed — never the CLABE itself, which `lib/analytics.ts` already
    // treats as PII.
    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      action: 'settlement_account.added',
      actor: auth.ctx.userId,
      details: `Cuenta de cobro agregada: ${(data as BankAccount).label}`,
    });

    if (auditError) {
      captureException(auditError, {
        route: 'POST /api/organization/bank-accounts',
        organization_id: organizationId,
      });
    }

    return NextResponse.json({ account: data as BankAccount });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Error interno' } },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { BANK_ACCOUNT_COLUMNS, validateBankAccount, type BankAccount } from '@/lib/bankAccounts';
import { captureException } from '@/lib/sentry';
import { describeDbWriteError } from '@/lib/dbWriteError';

/**
 * One settlement account: edit it, make it the default, or archive it (#164).
 *
 * **Archive, never delete.** A quote that has already been sent names the
 * account its client was told to pay; deleting that row would rewrite a money
 * record after the fact, so the FK from `quotes` is `ON DELETE RESTRICT` and
 * this route only ever sets `archived_at`. An archived account keeps resolving
 * for the quotes that named it — the public payer route refuses those rather
 * than substituting a different account (see `resolveQuoteAccount`).
 */

function forbidden(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: 'Solo el dueño de la cuenta puede cambiar las cuentas de cobro.',
      },
    },
    { status: 403 }
  );
}

function notFound(): NextResponse {
  // Scoped by organization_id as well as id: a by-id route without the filter
  // tells one tenant whether another tenant's row exists.
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'No se encontró esa cuenta de cobro' } },
    { status: 404 }
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'billing_management')) return forbidden();

  try {
    const body = await request.json();

    const { data: existing } = await supabase
      .from('bank_accounts')
      .select(BANK_ACCOUNT_COLUMNS)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!existing) return notFound();

    // Making this account the default: clear the current one first, because the
    // partial unique index allows exactly one live default per organization and
    // would otherwise refuse the write.
    if (body?.makeDefault === true) {
      if ((existing as BankAccount).archived_at) {
        return NextResponse.json(
          {
            error: {
              code: 'ACCOUNT_ARCHIVED',
              message: 'No puedes usar una cuenta archivada como principal. Reactívala primero.',
            },
          },
          { status: 409 }
        );
      }

      // Which row holds the flag now, so it can be put back if the set below
      // fails after the clear has already landed.
      const { data: previousDefault } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_default', true)
        .maybeSingle();

      const { error: clearError } = await supabase
        .from('bank_accounts')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('is_default', true);

      if (clearError) {
        const failure = describeDbWriteError(clearError, 'la cuenta principal', 'PATCH /api/organization/bank-accounts/[id]');
        return NextResponse.json(
          { error: { code: failure.code, message: failure.message } },
          { status: failure.status }
        );
      }

      const { data, error } = await supabase
        .from('bank_accounts')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select(BANK_ACCOUNT_COLUMNS)
        .maybeSingle();

      if (error || !data) {
        /**
         * The clear succeeded and the set did not, so this organization now has
         * live accounts and **no default** — every quote that named no account
         * resolves to nothing and refuses in front of its client. The partial
         * unique index forces the two steps (one live default per org), so the
         * window is real rather than theoretical.
         *
         * Put the previous default back before reporting the failure. If even
         * that fails there is nothing left to try from here, so it is reported
         * loudly rather than left as a silent divergence.
         */
        if (previousDefault?.id) {
          const { error: restoreError } = await supabase
            .from('bank_accounts')
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq('id', previousDefault.id)
            .eq('organization_id', organizationId);

          if (restoreError) {
            captureException(restoreError, {
              route: 'PATCH /api/organization/bank-accounts/[id]',
              organization_id: organizationId,
              // Live accounts, no default: every unassigned quote refuses until
              // someone sets one.
              extra: { detail: 'default cleared but neither set nor restored' },
            });
          }
        }

        const failure = describeDbWriteError(error, 'la cuenta principal', 'PATCH /api/organization/bank-accounts/[id]');
        return NextResponse.json(
          { error: { code: failure.code, message: failure.message } },
          { status: failure.status }
        );
      }

      // Changing where money settles is the move an attacker with a session, or
      // a departing employee, would actually make — and it leaves every screen
      // looking normal. Audited like the archive beside it, and like the PAC
      // disconnect. Best-effort, after the row is confirmed; never the CLABE,
      // which is treated as PII.
      const { error: auditError } = await supabase.from('audit_logs').insert({
        organization_id: organizationId,
        action: 'settlement_account.default_changed',
        actor: auth.ctx.userId,
        details: `Cuenta principal cambiada a: ${(data as BankAccount).label}`,
      });

      if (auditError) {
        captureException(auditError, {
          route: 'PATCH /api/organization/bank-accounts/[id]',
          organization_id: organizationId,
        });
      }

      return NextResponse.json({ account: data as BankAccount });
    }

    // Otherwise this is an edit of the account's own fields. Validated whole,
    // exactly as on create — the CLABE here is where money lands.
    const validated = validateBankAccount({
      label: body?.label,
      bankName: body?.bankName,
      clabe: body?.clabe,
      accountHolder: body?.accountHolder,
    });

    if (!validated.ok) {
      // Every problem at once, keyed by input, so an edit does not reveal them
      // one submit at a time (#146). Same envelope as POST.
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_INPUT',
            message: validated.message,
            field: validated.field,
            fields: validated.fields,
          },
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ ...validated.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select(BANK_ACCOUNT_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      const failure = describeDbWriteError(error, 'la cuenta de cobro', 'PATCH /api/organization/bank-accounts/[id]');
      return NextResponse.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status }
      );
    }

    // An edit can move the CLABE money lands in without changing anything a
    // tenant's screens would show differently — the same reason the PAC
    // disconnect and the archive are audited.
    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      action: 'settlement_account.updated',
      actor: auth.ctx.userId,
      details:
        `Cuenta de cobro editada: ${(existing as BankAccount).label}` +
        ((existing as BankAccount).clabe !== (data as BankAccount).clabe ? ' (CLABE cambiada)' : ''),
    });

    if (auditError) {
      captureException(auditError, {
        route: 'PATCH /api/organization/bank-accounts/[id]',
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'billing_management')) return forbidden();

  const { data: existing } = await supabase
    .from('bank_accounts')
    .select(BANK_ACCOUNT_COLUMNS)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!existing) return notFound();

  const account = existing as BankAccount;
  if (account.archived_at) {
    return NextResponse.json({ account });
  }

  // Archiving the default would leave unassigned quotes resolving to nothing
  // while other live accounts exist — a tenant who can be paid, being told they
  // cannot. Naming the replacement is the caller's decision, not this route's.
  if (account.is_default) {
    const { data: others } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .neq('id', id);

    if ((others?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'DEFAULT_ACCOUNT',
            message:
              'Esta es tu cuenta principal. Marca otra como principal antes de archivarla.',
          },
        },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .update({
      archived_at: new Date().toISOString(),
      // The CHECK forbids an archived row from holding the default flag, and
      // the tenant is knowingly leaving themselves with no account here.
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select(BANK_ACCOUNT_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    const failure = describeDbWriteError(error, 'la cuenta de cobro', 'DELETE /api/organization/bank-accounts/[id]');
    return NextResponse.json(
      { error: { code: failure.code, message: failure.message } },
      { status: failure.status }
    );
  }

  // Removing where money lands is at least as consequential as disconnecting
  // the PAC, which has written an audit row since it shipped.
  const { error: auditError } = await supabase.from('audit_logs').insert({
    organization_id: organizationId,
    action: 'settlement_account.archived',
    actor: auth.ctx.userId,
    details: `Cuenta de cobro archivada: ${account.label}`,
  });

  if (auditError) {
    captureException(auditError, {
      route: 'DELETE /api/organization/bank-accounts/[id]',
      organization_id: organizationId,
    });
  }

  return NextResponse.json({ account: data as BankAccount });
}

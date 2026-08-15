import { NextResponse } from 'next/server';
import { requireOrgAccess, requireUser, isDemoDeployment } from '@/lib/apiAuth';
import { normalizeClabe, isValidClabeLength, hasValidClabeCheckDigit } from '@/lib/clabe';
import { validateRFC } from '@/lib/rfcValidator';
import { normalizeClientPhone } from '@/lib/phoneValidator';
import { captureException } from '@/lib/sentry';
import {
  syncLegacyDefaultAccount,
  countLiveAccounts,
  SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_CODE,
  SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_MESSAGE,
  SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_CODE,
  SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_MESSAGE,
} from '@/lib/bankAccounts';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { apiError } from '@/lib/apiError';

export async function GET() {
  // No backend means no tenant data; the demo organization is honest here.
  if (isDemoDeployment()) {
    return NextResponse.json({
      organization: {
        id: 'org-demo-1',
        name: 'Distribuidora del Norte',
        rfc: 'DNO850101HD9',
        regimen_fiscal: '601',
        codigo_postal: '64000',
        industry: 'construction',
      },
      role: 'owner',
    });
  }

  // Previously fell back to the same demo organization for unauthenticated
  // callers and on any error, so a caller could not tell a real tenant from a
  // placeholder — and an anonymous request always got a 200.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: organization, error } = await (supabase as any)
      .from('organizations')
      // Explicit for the same reason PATCH is (see its comment): this row is
      // growing CFDI and billing columns, and `*` shipped `owner_id`,
      // `stripe_customer_id`, `stripe_subscription_id` and
      // `facturapi_organization_id` to the browser for no consumer's benefit —
      // and would ship the next sensitive column added here without a diff to
      // review. Every field below has a caller: onboarding resume, the settings
      // profile and branding cards, the bank card, the settlement-account gate
      // and the app-shell identity.
      // `stripe_customer_id` is selected but deliberately NOT returned — see
      // `hasBillingAccount` below.
      .select(
        'id, name, rfc, regimen_fiscal, codigo_postal, phone, logo_url, industry, ' +
          'subscription_tier, subscription_status, bank_name, bank_clabe, bank_account_holder, ' +
          'stripe_customer_id'
      )
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !organization) {
      return apiError(404, 'NOT_FOUND', 'Organización no encontrada');
    }

    // The billing card needs to know *whether* there is a Stripe customer, so
    // it can offer "Administrar mi suscripción" only to tenants for whom the
    // portal route will not 409 (#346). It does not need the id, and the
    // comment above is explicit that this row's Stripe columns have no
    // business in the browser — so the fact travels as a boolean and the id
    // stays server-side.
    const { stripe_customer_id: stripeCustomerId, ...safeOrganization } = organization;

    // The caller's role travels with the organization so the settlement-account
    // banner can address the right person (#64): only an owner can PATCH this
    // row — the update is scoped by `owner_id` — so pointing a member at the
    // bank form would send them somewhere they cannot save.
    return NextResponse.json({
      organization: safeOrganization,
      role,
      hasBillingAccount: Boolean(stripeCustomerId),
    });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error al obtener la organización');
  }
}

/**
 * Updates the organization's profile and/or SPEI settlement account.
 *
 * Two payload families, validated independently so a profile save is never
 * rejected for a missing CLABE and a bank save keeps its exact prior contract:
 * - bank: `bankName`, `bankClabe`, `bankAccountHolder` (all-or-nothing, as before)
 * - profile: `name`, `rfc`, `regimenFiscal`, `codigoPostal`, `phone`, `logoUrl`
 *   (each optional; only provided keys are written) — added for #95, which found
 *   the settings page saving with a PUT this route never implemented.
 *
 * The public payment page reads the bank values per quote; until an org sets
 * them it has no CLABE and that page refuses to render payment instructions
 * rather than falling back to a shared account (the previous behaviour).
 *
 * Scoped to an organization the caller owns: without the owner_id filter the
 * target would effectively be caller-supplied, letting one tenant redirect
 * another tenant's incoming payments (and the profile fields feed CFDI 4.0
 * stamping, so they get the same protection).
 */
export async function PATCH(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, userId, role, organizationId } = auth.ctx;

  // A member reaching this route gets a straight answer, rather than falling
  // through to the `owner_id` filter matching nothing and answering 404 "No se
  // encontró una organización propia" — which reads as *your business does not
  // exist* to someone whose only problem is that they are not the owner.
  //
  // That is #64's trap turned on its own user: never send someone to fix
  // something they lack the write for. The settings page already hides the form
  // for non-owners (`app/(dashboard)/settings/page.tsx`); this is the server
  // half of the same rule, and the half that answers a direct request.
  //
  // Unaffected by the uniqueness index this PR adds: one organization per owner
  // fixes *which row* the filter finds, not *who* is allowed to ask.
  if (role !== 'owner') {
    return apiError(403, 'FORBIDDEN', 'Solo el dueño de la organización puede cambiar estos datos');
  }

  try {
    const body = await request.json();
    const { bankName, bankClabe, bankAccountHolder } = body;

    const update: Record<string, unknown> = {};

    const hasBankPayload =
      bankName !== undefined || bankClabe !== undefined || bankAccountHolder !== undefined;

    if (hasBankPayload) {
      const clabe = typeof bankClabe === 'string' ? normalizeClabe(bankClabe) : '';

      // An explicitly emptied CLABE removes the account (#163). Until this
      // branch existed a saved account could be replaced but never taken away,
      // so a tenant whose bank account had closed had no way to stop
      // advertising it short of a hand edit against production — while the
      // schema had allowed the state all along (`chk_org_bank_clabe_format` is
      // `bank_clabe IS NULL OR ~ '^[0-9]{18}$'`).
      //
      // Safe precisely because of #64: with no CLABE the tenant gets a
      // non-dismissable banner, disabled share actions, and a 409 before any
      // /pay/ link reaches a client. Removal produces a handled state, not a
      // silent hole.
      //
      // Keyed on the CLABE being *present and empty*, never on the key being
      // absent — a profile save carries no bank keys and must not wipe the
      // account as a side effect (the `hasBankPayload` guard above), and the
      // other two columns follow the CLABE out so no half-account is left
      // behind for the payer page to read.
      //
      // Tested on the **raw** string, not on the normalized digits: `clabe` is
      // `raw.replace(/\D/g, '')`, so keying on `clabe.length === 0` would make
      // every digit-free value a deletion — `'pendiente'`, `'N/A'`, `'CLABE'`
      // would each destroy the settlement account and answer 200. Those are
      // typos, and a typo must stay a 400.
      const isExplicitClear = typeof bankClabe === 'string' && bankClabe.trim().length === 0;

      if (isExplicitClear) {
        // #198 — a single-account payload cannot express intent about several.
        //
        // This clear is the pre-#164 settings card's "Quitar cuenta", written
        // when an organization settled at exactly one account. An organization
        // now holds a list, and the mirror below archives *every* live row, so
        // one tap on a browser tab left open across the deploy would take all of
        // a tenant's accounts with it — and every /pay/ link naming any of them
        // starts refusing, in front of their clients.
        //
        // Nothing in the current UI sends this payload; the settings card is the
        // accounts list and onboarding writes to the accounts route. So refusing
        // costs a current tenant nothing, and the one caller it does stop is the
        // one that cannot have meant it. A tenant who really wants an account
        // gone has a screen that names which.
        //
        // Refused *before* the organization row is written: the mirror is
        // best-effort and never throws by design, so a guard there could not
        // reach the caller.
        const live = await countLiveAccounts(supabase, organizationId);

        if (!live.known) {
          // We could not read the list. Refusing is recoverable by retrying;
          // guessing "one" and being wrong destroys accounts that cannot be
          // un-archived from any screen. The message says what we don't know
          // rather than asserting a count we never read (hard rule #1).
          return apiError(503, SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_CODE, SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_MESSAGE);
        }

        if (live.count > 1) {
          return apiError(409, SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_CODE, SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_MESSAGE);
        }

        update.bank_clabe = null;
        update.bank_name = null;
        update.bank_account_holder = null;
      } else if (!isValidClabeLength(clabe)) {
        return apiError(400, 'INVALID_CLABE', 'La CLABE debe tener exactamente 18 dígitos');
      } else if (!hasValidClabeCheckDigit(clabe)) {
        // Enforced server-side since #66 (decided 2026-08-08): this is the
        // account a tenant's clients wire real money to, and the checksum
        // catches the transposition and single-digit typos a length check
        // cannot. Rejecting here beats a misdirected SPEI transfer later.
        return apiError(400, 'INVALID_CLABE', 'La CLABE no parece válida. Revísala dígito por dígito tal como aparece en tu banco.');
      } else if (!bankName || typeof bankName !== 'string' || !bankName.trim()) {
        return apiError(400, 'INVALID_INPUT', 'El nombre del banco es obligatorio');
      } else {
        update.bank_name = bankName.trim();
        update.bank_clabe = clabe;
        update.bank_account_holder =
          typeof bankAccountHolder === 'string' && bankAccountHolder.trim()
            ? bankAccountHolder.trim()
            : null;
      }
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return apiError(400, 'INVALID_INPUT', 'El nombre del negocio es obligatorio');
      }
      update.name = body.name.trim();
    }

    if (body.rfc !== undefined) {
      const rfc = typeof body.rfc === 'string' ? body.rfc.trim().toUpperCase() : '';
      if (rfc) {
        const check = validateRFC(rfc);
        if (!check.isValid) {
          return apiError(400, 'INVALID_RFC', check.error || 'El RFC no es válido');
        }
        update.rfc = rfc;
      } else {
        update.rfc = null;
      }
    }

    if (body.regimenFiscal !== undefined) {
      // Stored as the SAT code; old clients sent display labels like
      // '601 — General de Ley Personas Morales'. A non-empty value that yields
      // no code is a 400, not a silent NULL — this field feeds CFDI 4.0.
      const raw = typeof body.regimenFiscal === 'string' ? body.regimenFiscal.trim() : '';
      // Exactly three digits, alone or followed by a label separator — a
      // boundary-less match would silently truncate '6012' to a different code.
      const code = /^(\d{3})(?:\s*[—–-]|$)/.exec(raw);
      if (raw && !code) {
        return apiError(400, 'INVALID_INPUT', 'El régimen fiscal no es válido');
      }
      update.regimen_fiscal = code ? code[1] : null;
    }

    if (body.codigoPostal !== undefined) {
      const cp = typeof body.codigoPostal === 'string' ? body.codigoPostal.trim() : '';
      if (cp && !/^\d{5}$/.test(cp)) {
        return apiError(400, 'INVALID_INPUT', 'El código postal debe tener 5 dígitos');
      }
      update.codigo_postal = cp || null;
    }

    if (body.phone !== undefined) {
      const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (raw) {
        const normalized = normalizeClientPhone(raw);
        if (normalized.error || !normalized.value) {
          return apiError(400, 'INVALID_PHONE', 'El teléfono de contacto debe ser un número mexicano de 10 dígitos, por ejemplo 8112345678.');
        }
        update.phone = normalized.value;
      } else {
        update.phone = null;
      }
    }

    if (body.logoUrl !== undefined) {
      const logo = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : '';
      // https only: the logo renders on client-facing pages, so an arbitrary
      // scheme (javascript:) or plain-http origin is not acceptable there.
      if (logo && !/^https:\/\//i.test(logo)) {
        return apiError(400, 'INVALID_INPUT', 'La URL del logotipo debe comenzar con https://');
      }
      update.logo_url = logo || null;
    }

    if (Object.keys(update).length === 0) {
      return apiError(400, 'INVALID_INPUT', 'No hay datos que guardar');
    }

    update.updated_at = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organizations')
      .update(update)
      .eq('owner_id', userId)
      // Explicit list on purpose: this table is growing CFDI/billing columns,
      // and a `*` here would ship any future sensitive column to the browser
      // without a diff to review.
      .select(
        'id, name, rfc, regimen_fiscal, codigo_postal, phone, logo_url, subscription_tier, subscription_status, bank_name, bank_clabe, bank_account_holder'
      )
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'los datos de tu negocio', 'PATCH /api/organization');
    }

    if (!data) {
      return apiError(404, 'NOT_FOUND', 'No se encontró una organización propia');
    }

    // Changing where every future SPEI lands is at least as consequential as
    // disconnecting the PAC, which has written an audit row since it shipped
    // (`pac.disconnected`). Both directions are recorded, not just removal:
    // redirecting settlements to a different account is the move an attacker
    // with a session — or a departing employee — would actually make, and it
    // leaves the tenant's own screens looking entirely normal.
    //
    // Written after the row is confirmed, so the log never carries a change the
    // UPDATE did not make. Best-effort by design: a failed audit insert must not
    // turn a completed write into an error the tenant would retry (and retry
    // into a second, identical change).
    if ('bank_clabe' in update) {
      const removed = update.bank_clabe === null;

      // Keep `bank_accounts` in step with the legacy columns (#164).
      //
      // The settlement gate and the payer page read the account list now, while
      // this route still writes the three `organizations.bank_*` columns the
      // single-account form posts to. Letting those two diverge would recreate
      // the exact failure #64 closed: a gate reporting the tenant can be paid
      // while the payer page 409s in front of their client, or the reverse.
      //
      // Mirrors rather than replaces, because the columns are still read by
      // code deployed between this migration and this merge (hard rule #6).
      await syncLegacyDefaultAccount(supabase, data.id, removed ? null : update);
      // supabase-js resolves `{ data, error }` rather than throwing, so the
      // error channel has to be *read* — an RLS denial or a schema drift here
      // would otherwise leave no audit row and no trace of why. `try` covers
      // only a transport-level throw, and wraps just the awaited call so it
      // cannot swallow a programmer error in the surrounding lines.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: auditError } = await (supabase as any).from('audit_logs').insert({
          organization_id: data.id,
          action: removed ? 'settlement_account.removed' : 'settlement_account.updated',
          actor: userId,
          details: removed
            ? 'Cuenta bancaria para cobros SPEI eliminada'
            : 'Cuenta bancaria para cobros SPEI actualizada',
        });

        if (auditError) {
          captureException(auditError, {
            route: 'PATCH /api/organization',
            organization_id: data.id,
            user_id: userId,
            extra: {
              action: removed ? 'settlement_account.removed' : 'settlement_account.updated',
            },
          });
        }
      } catch (auditThrow) {
        captureException(auditThrow, {
          route: 'PATCH /api/organization',
          organization_id: data.id,
          extra: { stage: 'settlement_account audit insert' },
        });
      }
    }

    return NextResponse.json({ organization: data });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error interno');
  }
}

/**
 * Creates an organization owned by the caller.
 *
 * Uses requireUser rather than requireOrgAccess: this is how a user gets their
 * first organization, so not having one yet is the normal case.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { name, rfc, regimenFiscal, codigoPostal, industry } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'INVALID_INPUT', 'El nombre del negocio es obligatorio');
    }

    // The WhatsApp number registration required and then discarded (#142).
    // Register validates it as E.164 and stores it in the auth user's
    // metadata; nothing ever copied it onto the organization, so the field
    // every tenant filled in powered nothing — including the public quote
    // page's "Solicitar Cambios por WhatsApp" button, which renders only when
    // organizations.phone is set (#44's absent-is-absent rule). Read from the
    // session's own metadata, never the request body: the value was validated
    // at registration and belongs to the caller by construction.
    const { data: userData } = await supabase.auth.getUser();
    const metadataPhone = userData?.user?.user_metadata?.phone;
    const ownerPhone =
      typeof metadataPhone === 'string' && metadataPhone.trim().startsWith('+')
        ? metadataPhone.trim()
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('organizations')
      .insert({
        name: name.trim(),
        rfc: rfc ? String(rfc).toUpperCase().trim() : null,
        regimen_fiscal: regimenFiscal || null,
        codigo_postal: codigoPostal || null,
        industry: industry || null,
        phone: ownerPhone,
        owner_id: userId,
      })
      .select()
      .single();

    // Previously fell through to a fabricated 'org-demo-1' response on failure
    // or without a session, so onboarding appeared to succeed while creating
    // nothing.
    //
    // The failures are no longer interchangeable either. `uq_organizations_owner_id`
    // (20260811150000) makes "you already have a business" a reachable outcome
    // for an owner who reopens onboarding, and answering that with the same
    // opaque 500 as an outage is the #146 defect: a diagnosis thrown away, on
    // screen and in the log alike. `dbWriteErrorResponse` names the cause in
    // Spanish and `captureException`s the original — the 409 for that
    // constraint lives inside `describeDbWriteError`, which it calls, so this
    // route needs no special case of its own.
    if (error || !data) {
      return dbWriteErrorResponse(error, 'tu negocio', 'POST /api/organization', { verb: 'crear' });
    }

    return NextResponse.json({ organization: data });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error interno');
  }
}

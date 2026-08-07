import { NextResponse } from 'next/server';
import { isValidClabeLength } from '@/lib/clabe';

/**
 * The settlement-account gate (#64).
 *
 * An organization with no CLABE has nowhere for its customers to send money.
 * The public payment page already refuses to render instructions without one
 * (409 `ORG_BANK_DETAILS_MISSING`), but that refusal fires at the worst possible
 * moment — in front of the paying client, after the link has been shared.
 *
 * This module moves the refusal one step earlier: any server path that hands a
 * `/pay/` link to a client checks here first, so the tenant sees the problem
 * instead of their customer. The public route keeps its own check; this is a
 * gate in front of it, not a replacement for it.
 *
 * Two ways an organization ends up here, both of which predate the onboarding
 * step that collects the account:
 *   1. It was created before that step existed and is never asked again.
 *   2. Onboarding was abandoned between the step-2 `POST` that creates the
 *      organization and the step-3 `PATCH` that sets the account.
 */

/** Shared so the route, the hook and the tests cannot disagree on the wording. */
export const SETTLEMENT_ACCOUNT_MISSING_CODE = 'ORG_BANK_DETAILS_MISSING';

export const SETTLEMENT_ACCOUNT_MISSING_MESSAGE =
  'Agrega tu cuenta de cobro (CLABE de 18 dígitos) antes de compartir enlaces de pago con tus clientes.';

/** Just enough of an organization row to answer the question. */
export interface OrganizationSettlementFields {
  bank_clabe?: string | null;
}

/**
 * True when the organization can actually receive a SPEI transfer.
 *
 * Applies the same 18-digit rule `PATCH /api/organization` enforces rather than
 * a truthiness check, so a row carrying a partial or whitespace CLABE — which a
 * direct database edit can produce — is treated as missing rather than ready.
 */
export function hasSettlementAccount(
  organization: OrganizationSettlementFields | null | undefined
): boolean {
  const clabe = organization?.bank_clabe;
  return typeof clabe === 'string' && isValidClabeLength(clabe);
}

/** 409, in the `{ error: { code, message } }` shape every authenticated route uses. */
export function settlementAccountMissingResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: SETTLEMENT_ACCOUNT_MISSING_CODE,
        message: SETTLEMENT_ACCOUNT_MISSING_MESSAGE,
      },
    },
    { status: 409 }
  );
}

export type SettlementAccountResult =
  | { ok: true; clabe: string }
  | { ok: false; response: NextResponse };

/**
 * Reads the caller's organization and refuses when it has no settlement account.
 *
 * Scoped by the `organizationId` from `requireOrgAccess()` — a gate that reads
 * an unscoped row would answer for the wrong tenant. A lookup that fails or
 * returns nothing is treated as *not ready*: the alternative is letting a
 * payment link out on the strength of a query that did not run.
 */
export async function requireSettlementAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string
): Promise<SettlementAccountResult> {
  const { data: organization } = await supabase
    .from('organizations')
    .select('bank_clabe')
    .eq('id', organizationId)
    .maybeSingle();

  if (!hasSettlementAccount(organization)) {
    return { ok: false, response: settlementAccountMissingResponse() };
  }

  return { ok: true, clabe: organization.bank_clabe as string };
}

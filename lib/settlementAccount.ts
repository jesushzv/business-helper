import { NextResponse } from 'next/server';
import {
  BANK_ACCOUNT_COLUMNS,
  findDefaultAccount,
  selectableAccounts,
  type BankAccount,
} from '@/lib/bankAccounts';

/**
 * The settlement-account gate (#64), now over a list of accounts (#164).
 *
 * An organization with nowhere to receive money has nothing a `/pay/` link can
 * show. The public payment page already refuses to render instructions in that
 * state, but that refusal fires at the worst possible moment — in front of the
 * paying client, after the link has been shared. This module moves the refusal
 * one step earlier, so the tenant sees the problem instead of their customer.
 *
 * "Ready" used to mean one column held 18 digits. It now means the organization
 * has at least one account that is not archived. The question is the same one:
 * can this business receive a transfer at all?
 */

/** Shared so the route, the hook and the tests cannot disagree on the wording. */
export const SETTLEMENT_ACCOUNT_MISSING_CODE = 'ORG_BANK_DETAILS_MISSING';

export const SETTLEMENT_ACCOUNT_MISSING_MESSAGE =
  'Agrega tu cuenta de cobro (CLABE de 18 dígitos) antes de compartir enlaces de pago con tus clientes.';

/**
 * Whether this organization can receive a transfer.
 *
 * Takes the account list rather than an organization row: since #164 the
 * `organizations.bank_*` columns are a legacy mirror, and asking them would
 * answer for the wrong thing the moment a tenant keeps two accounts.
 */
export function hasSettlementAccount(accounts: BankAccount[] | null | undefined): boolean {
  return selectableAccounts(accounts ?? []).length > 0;
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
  | { ok: true; account: BankAccount; accounts: BankAccount[] }
  | { ok: false; response: NextResponse };

/**
 * Reads the caller's accounts and refuses when none can receive money.
 *
 * Scoped by the `organizationId` from `requireOrgAccess()` — a gate that read
 * an unscoped list would answer for the wrong tenant. A lookup that fails or
 * returns nothing is treated as *not ready*: the alternative is letting a
 * payment link out on the strength of a query that did not run.
 */
export async function requireSettlementAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string
): Promise<SettlementAccountResult> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select(BANK_ACCOUNT_COLUMNS)
    .eq('organization_id', organizationId)
    .is('archived_at', null);

  const accounts: BankAccount[] = error ? [] : ((data as BankAccount[]) ?? []);
  const live = selectableAccounts(accounts);

  if (live.length === 0) {
    return { ok: false, response: settlementAccountMissingResponse() };
  }

  /**
   * The default is what an unassigned quote settles at — and *only* the row
   * flagged as such.
   *
   * This used to fall back to `live[0]` (alphabetically first) when nothing
   * held the flag, on the theory that the state was transient. It is not
   * self-healing, and the fallback made this function disagree with the payer
   * route, which resolves the same state through `resolveQuoteAccount(null,
   * null)` and refuses. The two answering differently is #64's failure exactly:
   * the tenant's dashboard shows no banner and share buttons stay live, while
   * every quote that named no account dead-ends in front of its client.
   *
   * Naming an account nobody designated is also its own defect — it would send
   * a payer to whichever CLABE sorted first.
   */
  const settlementAccount = findDefaultAccount(live);
  if (!settlementAccount) {
    return { ok: false, response: settlementAccountMissingResponse() };
  }

  return { ok: true, account: settlementAccount, accounts: live };
}

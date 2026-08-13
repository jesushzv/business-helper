import { normalizeClabe, isValidClabeLength, hasValidClabeCheckDigit } from '@/lib/clabe';

/**
 * Several settlement accounts per organization, chosen per quote (#164).
 *
 * An organization used to settle at exactly one account, held in three columns
 * on `organizations`. It now keeps a list, one row flagged `is_default`, and a
 * quote may name the account its client pays into.
 *
 * The rules money depends on live here rather than in the routes, so the payer
 * page, the share gate and the settings UI cannot disagree about which account
 * a given quote resolves to.
 */

export interface BankAccount {
  id: string;
  organization_id?: string;
  label: string;
  bank_name: string;
  clabe: string;
  account_holder: string | null;
  is_default: boolean;
  archived_at: string | null;
  /**
   * Live quotes settling at this account (#196/#197), attached by the list
   * GET. Three states: an object (known), `null` (the read failed — unknown,
   * never rendered as zero), `undefined` (a response that does not carry it,
   * e.g. a write's returning row).
   */
  live_quotes?: AccountQuoteExposure | null;
}

/** Columns every consumer needs; named explicitly so a future column is a decision. */
export const BANK_ACCOUNT_COLUMNS =
  'id, organization_id, label, bank_name, clabe, account_holder, is_default, archived_at';

export const SETTLEMENT_ACCOUNT_MISSING_CODE = 'ORG_BANK_DETAILS_MISSING';
export const SETTLEMENT_ACCOUNT_ARCHIVED_CODE = 'SETTLEMENT_ACCOUNT_UNAVAILABLE';

export const SETTLEMENT_ACCOUNT_ARCHIVED_MESSAGE =
  'La cuenta de cobro de esta cotización ya no está disponible. Contacta al negocio antes de transferir.';

/** A legacy single-account clear arriving at an organization that holds several (#198). */
export const SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_CODE = 'SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS';

export const SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS_MESSAGE =
  'Tu negocio tiene varias cuentas de cobro. Entra a Ajustes y elige cuál quieres quitar.';

/** The count could not be read, so we refuse rather than guess (#198). */
export const SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_CODE = 'SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED';

export const SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED_MESSAGE =
  'No pudimos revisar tus cuentas de cobro en este momento. Vuelve a intentarlo en unos segundos.';

/**
 * How many live accounts an organization holds — or that we could not tell.
 *
 * Three states, not two (#64's rule at the query). Collapsing "the read failed"
 * into a number invents a fact, and the caller here uses this to decide whether
 * to *destroy* accounts, so an invented `1` archives a tenant's whole list.
 */
export type LiveAccountCount = { known: true; count: number } | { known: false };

export async function countLiveAccounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string
): Promise<LiveAccountCount> {
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .is('archived_at', null);

    // supabase-js resolves `{ data, error }` rather than throwing, so the error
    // channel has to be read — an RLS denial arrives here as data: null, and
    // treating that as "no accounts" is exactly the invented fact above.
    if (error || !Array.isArray(data)) return { known: false };
    return { known: true, count: data.length };
  } catch {
    return { known: false };
  }
}

/** Quote states still collectable — the ones whose payment instructions an archive strands or a CLABE edit rewrites. */
export const LIVE_QUOTE_STATUSES = ['sent', 'accepted', 'converted'] as const;

export interface AccountQuoteExposure {
  count: number;
  /** Distinct client names, so the tenant can recognise which deals are affected. */
  client_names: string[];
}

/**
 * Which live quotes settle at each of the organization's accounts (#196/#197).
 *
 * The archive confirmation used to name no count and no client, and after a
 * quote is created no screen shows which account it settles at — so a tenant
 * archiving an account with twenty live quotes learned about it from a
 * confused client. This is the query that gives the confirmation its facts.
 *
 * `null` means the read failed — unknown, not zero (#96): the caller falls
 * back to generic wording rather than telling a tenant "ninguna cotización"
 * off a network blip.
 */
export async function mapAccountQuoteExposure(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string
): Promise<Record<string, AccountQuoteExposure> | null> {
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('bank_account_id, clients!client_id(name)')
      .eq('organization_id', organizationId)
      .not('bank_account_id', 'is', null)
      .in('status', [...LIVE_QUOTE_STATUSES]);

    if (error || !Array.isArray(data)) {
      // The caller renders generic wording for null; the cause still gets said
      // somewhere, or a persistently failing read degrades every archive and
      // CLABE confirmation silently.
      if (error) console.error('[bank-accounts] exposure read failed:', error.message ?? error);
      return null;
    }

    const map: Record<string, AccountQuoteExposure> = {};
    for (const row of data as Array<{
      bank_account_id: string;
      clients?: { name?: string } | Array<{ name?: string }> | null;
    }>) {
      const entry = (map[row.bank_account_id] ||= { count: 0, client_names: [] });
      entry.count += 1;
      const related = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      if (related?.name && !entry.client_names.includes(related.name)) {
        entry.client_names.push(related.name);
      }
    }
    return map;
  } catch (err) {
    console.error('[bank-accounts] exposure read threw:', err);
    return null;
  }
}

/** Archived accounts stay readable — old quotes name them — but never receive new money. */
export function isLiveAccount(account: Pick<BankAccount, 'archived_at'> | null | undefined): boolean {
  return Boolean(account) && !account!.archived_at;
}

export function findDefaultAccount(accounts: BankAccount[]): BankAccount | null {
  return accounts.find((a) => a.is_default && isLiveAccount(a)) ?? null;
}

/** Accounts a new quote may be pointed at, default first. */
export function selectableAccounts(accounts: BankAccount[]): BankAccount[] {
  return accounts
    .filter(isLiveAccount)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.label.localeCompare(b.label));
}

export type AccountResolution =
  | { ok: true; account: BankAccount; source: 'quote' | 'default' }
  | { ok: false; reason: 'none' | 'archived' };

/**
 * Which account a quote's client pays into.
 *
 * Two rules, both deliberate:
 *
 * - A quote that names an account uses **that** account, never the current
 *   default. The tenant chose where this client's money lands, and quietly
 *   redirecting it because the default changed later would move real money to
 *   an account nobody picked for it.
 * - If the named account has since been archived, this **refuses** rather than
 *   falling back to the default. The tenant archived it for a reason — a closed
 *   bank account being the obvious one — and sending a payer there, or to a
 *   substitute they did not choose, are both worse than saying so.
 *
 * A quote with no account named is every quote written before #164, and means
 * "whatever the organization settles at": the live default.
 */
export function resolveQuoteAccount(
  namedAccount: BankAccount | null | undefined,
  defaultAccount: BankAccount | null | undefined
): AccountResolution {
  if (namedAccount) {
    if (!isLiveAccount(namedAccount)) return { ok: false, reason: 'archived' };
    return { ok: true, account: namedAccount, source: 'quote' };
  }

  if (defaultAccount && isLiveAccount(defaultAccount)) {
    return { ok: true, account: defaultAccount, source: 'default' };
  }

  return { ok: false, reason: 'none' };
}

export interface BankAccountInput {
  label?: unknown;
  bankName?: unknown;
  clabe?: unknown;
  accountHolder?: unknown;
}

export interface ValidatedBankAccount {
  label: string;
  bank_name: string;
  clabe: string;
  account_holder: string | null;
}

/**
 * Field names as the form knows them. Keyed messages are addressed to inputs,
 * so the key has to be the input's name and not the column's — `bankName`, not
 * `bank_name`. Exported so a form cannot invent a key nothing renders.
 */
export type BankAccountField = 'label' | 'bankName' | 'clabe';

export type BankAccountFieldErrors = Partial<Record<BankAccountField, string>>;

export type BankAccountValidation =
  | { ok: true; value: ValidatedBankAccount }
  /**
   * `fields` is the whole answer; `field` and `message` are the first entry,
   * kept so a caller with one message slot still says something true.
   */
  | { ok: false; fields: BankAccountFieldErrors; field: BankAccountField; message: string };

/** The order messages are reported in, so "the first problem" is stable. */
const FIELD_ORDER: BankAccountField[] = ['label', 'bankName', 'clabe'];

/**
 * Validates a whole account at once, keyed by field.
 *
 * **Every field is checked before returning.** Returning at the first failure
 * is #146's shape: the tenant fixes the label, submits, and only then learns
 * the CLABE is short — one round trip per mistake, on a phone, on the form that
 * decides where their money lands. This function used to do exactly that while
 * its own docblock claimed it did not, which is why the claim now names the
 * test that holds it: the "reports every problem in one pass" cases in
 * `tests/unit/bankAccounts.test.ts`.
 */
export function validateBankAccount(input: BankAccountInput): BankAccountValidation {
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  const bankName = typeof input.bankName === 'string' ? input.bankName.trim() : '';
  const clabe = typeof input.clabe === 'string' ? normalizeClabe(input.clabe) : '';

  const fields: BankAccountFieldErrors = {};

  if (!label) {
    fields.label = 'Ponle un nombre a esta cuenta (ej. "BBVA obra")';
  }
  if (!bankName) {
    fields.bankName = 'El nombre del banco es obligatorio';
  }
  if (!isValidClabeLength(clabe)) {
    fields.clabe = 'La CLABE debe tener exactamente 18 dígitos';
  } else if (!hasValidClabeCheckDigit(clabe)) {
    // Same checksum the single-account form has enforced since #66: it catches
    // the transposed digit a length check cannot, before money is wired.
    fields.clabe =
      'La CLABE no parece válida. Revísala dígito por dígito tal como aparece en tu banco.';
  }

  const firstField = FIELD_ORDER.find((name) => fields[name]);
  if (firstField) {
    return { ok: false, fields, field: firstField, message: fields[firstField]! };
  }

  const holder = typeof input.accountHolder === 'string' ? input.accountHolder.trim() : '';

  return {
    ok: true,
    value: { label, bank_name: bankName, clabe, account_holder: holder || null },
  };
}

export type QuoteAccountCheck =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

/**
 * Whether this organization may point a quote at this account (#164).
 *
 * The FK on `quotes.bank_account_id` proves only that the row **exists** — not
 * whose it is. Nothing else closes the gap: the quotes RLS policy scopes by the
 * quote's `organization_id`, not by the account it names, and the public payer
 * route reads through the **service client** and embeds
 * `bank_accounts!bank_account_id`, so whatever id the column holds is what a
 * paying client is shown.
 *
 * So an unchecked id is two failures at once:
 *
 * - **A cross-tenant read.** A quote naming another organization's account
 *   renders *their* bank name, CLABE and account holder on a payment page the
 *   caller controls.
 * - **Money to the wrong business.** The payer follows those instructions.
 *
 * Neither needs an attacker — a stale id from a client that cached an archived
 * account produces the second on its own. Archived accounts are refused here
 * for the same reason `resolveQuoteAccount` refuses them later: the tenant
 * archived it, and a new quote must not be pointed at it.
 *
 * `null` is always allowed: it means "settle at the organization's default",
 * which is what every quote written before #164 means.
 */
export async function checkQuoteAccountOwnership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  bankAccountId: unknown
): Promise<QuoteAccountCheck> {
  if (bankAccountId === null || bankAccountId === undefined) return { ok: true };

  if (typeof bankAccountId !== 'string' || !bankAccountId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INPUT',
      message: 'La cuenta de cobro seleccionada no es válida',
    };
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, archived_at')
    // Scoped by organization as well as id, so a by-id lookup cannot confirm
    // that another tenant's row exists.
    .eq('id', bankAccountId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'SERVER_ERROR',
      message: 'No se pudo verificar la cuenta de cobro',
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 400,
      code: 'BANK_ACCOUNT_NOT_FOUND',
      message: 'Esa cuenta de cobro no existe en tu negocio',
    };
  }

  if (data.archived_at) {
    return {
      ok: false,
      status: 409,
      code: 'BANK_ACCOUNT_ARCHIVED',
      message: 'Esa cuenta está archivada. Elige otra para cobrar esta cotización.',
    };
  }

  return { ok: true };
}

/**
 * Mirrors a legacy single-account write into `bank_accounts` (#164).
 *
 * `PATCH /api/organization` still accepts the three `organizations.bank_*`
 * columns the original settings form posts, while the gate and the payer page
 * now read the account list. If those two ever disagree, the tenant gets #64's
 * failure back: told they can be paid while their client's payment page
 * refuses, or the reverse.
 *
 * - A cleared account archives every live row, since the tenant has just said
 *   they have nowhere to receive money.
 * - A saved account updates the live default in place when there is one, so a
 *   tenant editing a typo does not accumulate a second account; otherwise it
 *   creates the default.
 *
 * Best-effort and never throws: the organization row is already written by the
 * time this runs, and failing the request would report a save that did happen
 * as a failure. A divergence is reported through `captureException` instead.
 */
export async function syncLegacyDefaultAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  values: Record<string, unknown> | null
): Promise<void> {
  const now = new Date().toISOString();

  try {
    if (!values) {
      await supabase
        .from('bank_accounts')
        .update({ archived_at: now, is_default: false, updated_at: now })
        .eq('organization_id', organizationId)
        .is('archived_at', null);
      return;
    }

    const clabe = typeof values.bank_clabe === 'string' ? values.bank_clabe : '';
    if (!isValidClabeLength(clabe)) return;

    const bankName = typeof values.bank_name === 'string' ? values.bank_name : 'Banco';
    const holder = typeof values.bank_account_holder === 'string' ? values.bank_account_holder : null;

    const { data: current } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_default', true)
      .is('archived_at', null)
      .maybeSingle();

    if (current?.id) {
      await supabase
        .from('bank_accounts')
        .update({ label: bankName, bank_name: bankName, clabe, account_holder: holder, updated_at: now })
        .eq('id', current.id);
      return;
    }

    await supabase.from('bank_accounts').insert({
      organization_id: organizationId,
      label: bankName,
      bank_name: bankName,
      clabe,
      account_holder: holder,
      is_default: true,
    });
  } catch {
    // Deliberately swallowed — see the docblock. The mirror failing must not
    // turn a completed organization write into an error the tenant retries.
  }
}

/**
 * Per-recipient rate limiting for OTP issuance.
 *
 * The signing endpoint's original bound was a 30s cooldown on
 * `quotes.client_otp_sent_at` — per quote. One client with several open quotes
 * has several valid public tokens resolving to a single `clients.phone`, so
 * cycling between tokens issued a code per request with no cooldown ever
 * applying. Every send is a billable message, so the meaningful budget is the
 * one the recipient's phone spends, not the one a quote spends.
 *
 * Two properties matter and neither is available in process:
 *
 *  - The key is the recipient phone, resolved server-side from the database.
 *    The endpoint is unauthenticated, so nothing the caller supplies can be
 *    trusted to identify who is being messaged.
 *  - The counter is persisted. Serverless invocations share no memory; a
 *    module-level Map would reset on a cold start and limit nothing on Vercel.
 *
 * State therefore lives in `public.otp_send_log` (see
 * `supabase/migrations/20260807000000_otp_send_rate_limit.sql`), and every
 * function here that touches it throws on a database error so the caller fails
 * closed rather than sending unbounded messages when the ledger is unreachable.
 */

import { formatE164MexicanPhone } from './whatsappOutbound';

/** Rolling window over which sends to one phone are counted. */
export const OTP_PHONE_WINDOW_MS = 60 * 60 * 1000;

/** Codes one phone may receive within `OTP_PHONE_WINDOW_MS`, across all quotes. */
export const OTP_PHONE_WINDOW_MAX_SENDS = 5;

/**
 * Codes a single quote may ever issue. The hourly phone cap alone still lets a
 * quote drip out codes indefinitely; this bounds the total.
 */
export const OTP_QUOTE_LIFETIME_MAX_SENDS = 10;

export const OTP_SEND_LOG_TABLE = 'otp_send_log';

export type OtpRateLimitScope = 'phone' | 'quote';

export interface OtpRateLimitDenial {
  allowed: false;
  scope: OtpRateLimitScope;
  error: string;
  /**
   * Present only when waiting actually helps — the hourly window drains, the
   * per-quote lifetime cap does not.
   */
  retryAfterSeconds?: number;
}

export type OtpRateLimitDecision = { allowed: true } | OtpRateLimitDenial;

/**
 * Resolves a stored phone to the single form used as the limit key.
 *
 * Without this, "8115559988" on one client row and "+52 811 555 9988" on
 * another would be two budgets for one handset.
 */
export function normalizeOtpRecipient(phone: string | null | undefined): string | null {
  const e164 = formatE164MexicanPhone(phone || '');
  return /^\+[0-9]{10,15}$/.test(e164) ? e164 : null;
}

/**
 * Decides on a phone's hourly budget given the sends already recorded for it.
 *
 * Pure, so the window arithmetic is testable without a database, and shared by
 * both the pre-insert check and the post-insert race check.
 */
export function evaluatePhoneWindow(
  sentAt: readonly string[],
  now: Date = new Date()
): OtpRateLimitDecision {
  const nowMs = now.getTime();
  const windowStart = nowMs - OTP_PHONE_WINDOW_MS;

  // `>=` rather than `>`, to match the `gte` the ledger query filters on: the
  // ranking in reserveOtpSend is computed over SQL-filtered rows and the denial
  // over these, so a row landing exactly on the boundary must not be counted by
  // one and dropped by the other.
  const inWindow = sentAt
    .map((iso) => new Date(iso).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart)
    .sort((a, b) => a - b);

  if (inWindow.length < OTP_PHONE_WINDOW_MAX_SENDS) {
    return { allowed: true };
  }

  // A slot opens once enough of the oldest sends have aged out to drop the
  // count below the cap. With n sends recorded that is the (n - cap + 1)-th
  // oldest, i.e. index n - cap.
  const freesAt = inWindow[inWindow.length - OTP_PHONE_WINDOW_MAX_SENDS] + OTP_PHONE_WINDOW_MS;

  return {
    allowed: false,
    scope: 'phone',
    error: 'Se enviaron demasiados códigos a este número. Intente de nuevo más tarde.',
    retryAfterSeconds: Math.max(1, Math.ceil((freesAt - nowMs) / 1000)),
  };
}

/** Decides on a quote's lifetime budget given how many codes it has issued. */
export function evaluateQuoteLifetime(sendCount: number): OtpRateLimitDecision {
  if (sendCount < OTP_QUOTE_LIFETIME_MAX_SENDS) {
    return { allowed: true };
  }

  return {
    allowed: false,
    scope: 'quote',
    error:
      'Esta cotización alcanzó el límite de códigos de verificación. Solicite una nueva al proveedor.',
  };
}

export interface OtpSendLogRow {
  id: string;
  created_at: string;
}

interface LedgerResult {
  data: OtpSendLogRow[] | null;
  error: unknown;
  count?: number | null;
}

/** The subset of the Supabase query builder this module uses. */
export interface OtpLedgerQuery extends PromiseLike<LedgerResult> {
  eq(column: string, value: string): OtpLedgerQuery;
  gte(column: string, value: string): OtpLedgerQuery;
  order(column: string, options: { ascending: boolean }): OtpLedgerQuery;
}

export interface OtpLedgerClient {
  from(table: string): {
    select(columns: string, options?: { count?: 'exact'; head?: boolean }): OtpLedgerQuery;
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{ data: OtpSendLogRow | null; error: unknown }>;
      };
    };
    delete(): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
  };
}

export interface OtpSendContext {
  phoneE164: string;
  quoteId: string;
  channel?: string | null;
  now?: Date;
}

function ledgerError(operation: string, error: unknown): Error {
  const detail =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return new Error(`otp_send_log ${operation} failed: ${detail}`);
}

/**
 * The sends to `phoneE164` still inside the rolling window, oldest first.
 *
 * `id` breaks ties on `created_at` so the ordering is total — `reserveOtpSend`
 * relies on every invocation agreeing on which rows hold the window's slots.
 */
async function readPhoneWindow(
  client: OtpLedgerClient,
  phoneE164: string,
  now: Date
): Promise<OtpSendLogRow[]> {
  const windowStart = new Date(now.getTime() - OTP_PHONE_WINDOW_MS).toISOString();

  const { data, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .select('id, created_at')
    .eq('phone_e164', phoneE164)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw ledgerError('window read', error);

  return data || [];
}

/** How many codes this quote has issued over its whole life. */
async function readQuoteSendCount(client: OtpLedgerClient, quoteId: string): Promise<number> {
  const { count, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId);

  if (error) throw ledgerError('quote count read', error);

  return count ?? 0;
}

/** Reads both budgets without consuming either. Exported for diagnostics and tests. */
export async function checkOtpSendAllowance(
  client: OtpLedgerClient,
  { phoneE164, quoteId, now = new Date() }: OtpSendContext
): Promise<OtpRateLimitDecision> {
  const window = await readPhoneWindow(client, phoneE164, now);
  const phoneDecision = evaluatePhoneWindow(
    window.map((row) => row.created_at),
    now
  );
  if (!phoneDecision.allowed) return phoneDecision;

  return evaluateQuoteLifetime(await readQuoteSendCount(client, quoteId));
}

/** Appends one send to the ledger and returns the row that now represents it. */
export async function recordOtpSend(
  client: OtpLedgerClient,
  { phoneE164, quoteId, channel = null }: OtpSendContext
): Promise<OtpSendLogRow> {
  const { data, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .insert({
      phone_e164: phoneE164,
      quote_id: quoteId,
      channel,
    })
    .select('id, created_at')
    .single();

  if (error || !data) throw ledgerError('insert', error);

  return data;
}

/** Gives a claimed slot back, for a send that was never authorized to happen. */
async function releaseOtpSend(client: OtpLedgerClient, id: string): Promise<void> {
  const { error } = await client.from(OTP_SEND_LOG_TABLE).delete().eq('id', id);

  if (error) throw ledgerError('release', error);
}

/**
 * Claims a slot in both budgets, returning the decision the route should act on.
 *
 * The slot is claimed *before* the code is minted and delivered, so a send that
 * later fails at the provider still spends its budget. That is the direction to
 * fail in: a provider erroring on every call must not become an unmetered loop.
 *
 * Concurrency: two invocations can clear the pre-check at the same moment —
 * separate functions share nothing but this table, and there is no lock to
 * take. The reservation is settled after the row lands instead: the window is
 * re-read and each caller looks up where its own row ranks. The oldest `cap`
 * rows hold the slots, so exactly one caller wins each one; a caller that
 * ranks past the cap deletes its row and stands down before anything is
 * delivered, leaving the budget it briefly held intact.
 */
export async function reserveOtpSend(
  client: OtpLedgerClient,
  context: OtpSendContext
): Promise<OtpRateLimitDecision> {
  const now = context.now ?? new Date();

  const precheck = await checkOtpSendAllowance(client, { ...context, now });
  if (!precheck.allowed) return precheck;

  const claimed = await recordOtpSend(client, context);

  const window = await readPhoneWindow(client, context.phoneE164, now);
  const rank = window.findIndex((row) => row.id === claimed.id);

  if (rank === -1) {
    // The row we just wrote is not in the window we just read, so the ranking
    // cannot be trusted — and neither can any budget derived from it. The
    // plausible cause is clock skew between this function and the database
    // wide enough to place `created_at` outside `windowStart`, which would
    // quietly disable the limit for every caller rather than just this one.
    // Fail closed and make it visible, in keeping with the rest of the module.
    throw new Error(
      `otp_send_log ranking failed: row ${claimed.id} absent from its own window`
    );
  }

  if (rank >= OTP_PHONE_WINDOW_MAX_SENDS) {
    await releaseOtpSend(client, claimed.id);

    return evaluatePhoneWindow(
      window.filter((row) => row.id !== claimed.id).map((row) => row.created_at),
      now
    );
  }

  return { allowed: true };
}

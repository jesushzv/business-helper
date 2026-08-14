/**
 * Per-recipient rate limiting for OTP issuance.
 *
 * The signing endpoint's original bound was a 30s cooldown on
 * `quotes.client_otp_sent_at` — per quote. One client with several open quotes
 * has several valid public tokens resolving to a single contact, so cycling
 * between tokens issued a code per request with no cooldown ever applying.
 * The meaningful budget is the one the recipient's inbox or handset spends,
 * not the one a quote spends.
 *
 * The key is the recipient the database holds for the client — the email
 * address on the email channel, the E.164 phone on the dev console fallback
 * (and in ledger rows from the removed sms/whatsapp channels). Both normalize
 * to a single canonical form so two rows spelling the same contact
 * differently share one budget.
 *
 * Two properties matter and neither is available in process:
 *
 *  - The key is resolved server-side from the database. The endpoint is
 *    unauthenticated, so nothing the caller supplies can be trusted to
 *    identify who is being messaged.
 *  - The counter is persisted. Serverless invocations share no memory; a
 *    module-level Map would reset on a cold start and limit nothing on Vercel.
 *
 * State therefore lives in `public.otp_send_log` (see
 * `supabase/migrations/20260807000000_otp_send_rate_limit.sql`), and every
 * function here that touches it throws on a database error so the caller fails
 * closed rather than sending unbounded messages when the ledger is unreachable.
 */

import { formatE164Phone } from './phoneValidator';
import { looksLikeEmail } from './clientFieldHints';

/** Rolling window over which sends to one recipient are counted. */
export const OTP_PHONE_WINDOW_MS = 60 * 60 * 1000;

/** Codes one recipient may receive within `OTP_PHONE_WINDOW_MS`, across all quotes. */
export const OTP_PHONE_WINDOW_MAX_SENDS = 5;

/**
 * The daily layer on top of the hourly one (#22): 5/hour sustained is 120
 * messages a day to one handset — billable, and past what any signer needs.
 * The figure is convention (Twilio's guidance suggests 10–20), not a standard;
 * revisit against real traffic once a provider is live.
 */
const OTP_PHONE_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const OTP_PHONE_DAY_MAX_SENDS = 15;

/**
 * Escalating resend backoff (#22), keyed on the phone like every other bound
 * here: the flat 30s cooldown treated a signer's first resend and a pump's
 * tenth identically. The gap doubles per send already inside the hourly
 * window — 30s, 60s, 120s, … — so a batch signer barely notices while a drip
 * hits a widening wall. Capped so a legitimate signer is never told to wait
 * longer than the hourly window itself would impose.
 */
export const OTP_RESEND_BACKOFF_BASE_MS = 30 * 1000;
export const OTP_RESEND_BACKOFF_MAX_MS = 15 * 60 * 1000;

/**
 * Codes a single quote may ever issue. The hourly phone cap alone still lets a
 * quote drip out codes indefinitely; this bounds the total.
 *
 * Counts only sends that reached the provider successfully: a delivery
 * failure releases this slot (while keeping its hourly one), so an outage
 * cannot permanently exhaust a quote (#60).
 */
export const OTP_QUOTE_LIFETIME_MAX_SENDS = 10;

const OTP_SEND_LOG_TABLE = 'otp_send_log';

export type OtpRateLimitScope = 'phone' | 'phone_day' | 'backoff' | 'quote';

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

export type OtpRateLimitDecision =
  | {
      allowed: true;
      /**
       * The ledger row backing an allowed reservation, so the route can flag
       * it when the provider later fails (#60). Absent from read-only checks.
       */
      sendId?: string;
    }
  | OtpRateLimitDenial;

/**
 * Resolves a stored phone to the single form used as the limit key.
 *
 * Without this, "8115559988" on one client row and "+52 811 555 9988" on
 * another would be two budgets for one handset.
 */
export function normalizeOtpPhone(phone: string | null | undefined): string | null {
  const e164 = formatE164Phone(phone || '');
  return /^\+[0-9]{10,15}$/.test(e164) ? e164 : null;
}

/**
 * The email counterpart: one inbox, one budget, however the address is cased
 * or padded on the client row. Validation is deliberately the forgiving
 * `looksLikeEmail` shape — the gate that matters is whether Resend can
 * deliver, and a strict pattern here would refuse addresses that can receive.
 */
export function normalizeOtpEmail(email: string | null | undefined): string | null {
  const canonical = (email || '').trim().toLowerCase();
  return looksLikeEmail(canonical) ? canonical : null;
}

interface PhoneWindowOptions {
  windowMs?: number;
  maxSends?: number;
  scope?: OtpRateLimitScope;
  error?: string;
}

/**
 * Decides on a phone's rolling-window budget given the sends already recorded
 * for it. Defaults describe the hourly window; the daily cap reuses the same
 * arithmetic with its own bounds (#22).
 *
 * Pure, so the window arithmetic is testable without a database, and shared by
 * both the pre-insert check and the post-insert race check.
 */
export function evaluatePhoneWindow(
  sentAt: readonly string[],
  now: Date = new Date(),
  {
    windowMs = OTP_PHONE_WINDOW_MS,
    maxSends = OTP_PHONE_WINDOW_MAX_SENDS,
    scope = 'phone',
    error = 'Se enviaron demasiados códigos de verificación. Intente de nuevo más tarde.',
  }: PhoneWindowOptions = {}
): OtpRateLimitDecision {
  const nowMs = now.getTime();
  const windowStart = nowMs - windowMs;

  // `>=` rather than `>`, to match the `gte` the ledger query filters on: the
  // ranking in reserveOtpSend is computed over SQL-filtered rows and the denial
  // over these, so a row landing exactly on the boundary must not be counted by
  // one and dropped by the other.
  const inWindow = sentAt
    .map((iso) => new Date(iso).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart)
    .sort((a, b) => a - b);

  if (inWindow.length < maxSends) {
    return { allowed: true };
  }

  // A slot opens once enough of the oldest sends have aged out to drop the
  // count below the cap. With n sends recorded that is the (n - cap + 1)-th
  // oldest, i.e. index n - cap.
  const freesAt = inWindow[inWindow.length - maxSends] + windowMs;

  return {
    allowed: false,
    scope,
    error,
    retryAfterSeconds: Math.max(1, Math.ceil((freesAt - nowMs) / 1000)),
  };
}

/**
 * Paces resends to one phone with a doubling gap (#22): after n sends inside
 * the hourly window the next needs base·2^(n-1) since the most recent, capped
 * at OTP_RESEND_BACKOFF_MAX_MS. First send of the hour is never delayed.
 */
export function evaluateResendBackoff(
  sentAt: readonly string[],
  now: Date = new Date()
): OtpRateLimitDecision {
  const nowMs = now.getTime();
  const windowStart = nowMs - OTP_PHONE_WINDOW_MS;

  const inWindow = sentAt
    .map((iso) => new Date(iso).getTime())
    .filter((ms) => Number.isFinite(ms) && ms >= windowStart)
    .sort((a, b) => a - b);

  if (inWindow.length === 0) return { allowed: true };

  const requiredGapMs = Math.min(
    OTP_RESEND_BACKOFF_BASE_MS * 2 ** (inWindow.length - 1),
    OTP_RESEND_BACKOFF_MAX_MS
  );
  const readyAt = inWindow[inWindow.length - 1] + requiredGapMs;

  if (nowMs >= readyAt) return { allowed: true };

  return {
    allowed: false,
    scope: 'backoff',
    error: 'Espere un momento antes de solicitar otro código.',
    retryAfterSeconds: Math.max(1, Math.ceil((readyAt - nowMs) / 1000)),
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
  eq(column: string, value: string | boolean): OtpLedgerQuery;
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
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
    delete(): {
      eq(column: string, value: string): PromiseLike<{ error: unknown }>;
    };
  };
}

export interface OtpSendContext {
  /**
   * The normalized limit key — an email or an E.164 phone. Stored in the
   * ledger's `phone_e164` column, whose name predates the email channel; the
   * column is not renamed because Vercel deploys `main` before migrations run
   * by hand, and the old code must keep writing during that window.
   */
  recipient: string;
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
 * The sends to `recipient` inside the last `windowMs`, oldest first.
 *
 * `id` breaks ties on `created_at` so the ordering is total — `reserveOtpSend`
 * relies on every invocation agreeing on which rows hold the window's slots.
 * Failed deliveries are included on purpose: the phone windows exist to
 * throttle what the provider is asked to send, and a provider erroring on
 * every call must not become an unmetered loop.
 */
async function readPhoneWindow(
  client: OtpLedgerClient,
  recipient: string,
  now: Date,
  windowMs: number = OTP_PHONE_WINDOW_MS
): Promise<OtpSendLogRow[]> {
  const windowStart = new Date(now.getTime() - windowMs).toISOString();

  const { data, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .select('id, created_at')
    .eq('phone_e164', recipient)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw ledgerError('window read', error);

  return data || [];
}

/**
 * How many codes this quote has issued over its whole life — counting only
 * deliveries that succeeded. A provider failure flags its row instead of
 * deleting it, so the hourly/daily throttles keep seeing it while this cap
 * does not (#60).
 */
async function readQuoteSendCount(client: OtpLedgerClient, quoteId: string): Promise<number> {
  const { count, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId)
    .eq('delivery_failed', false);

  if (error) throw ledgerError('quote count read', error);

  return count ?? 0;
}

/** Splits a day-window read into the subset also inside the hourly window. */
function hourSubset(rows: OtpSendLogRow[], now: Date): OtpSendLogRow[] {
  const hourStart = now.getTime() - OTP_PHONE_WINDOW_MS;
  return rows.filter((row) => {
    const ms = new Date(row.created_at).getTime();
    return Number.isFinite(ms) && ms >= hourStart;
  });
}

/**
 * The pacing check (#22), run by the route before it reserves a slot.
 *
 * Separate from the caps on purpose: backoff is best-effort pacing (two truly
 * concurrent requests may both clear it), while the caps in reserveOtpSend
 * settle races on the ledger and are the hard bound. Folding pacing into the
 * reservation would make the race settlement ambiguous about which rule it is
 * enforcing.
 */
export async function checkResendBackoff(
  client: OtpLedgerClient,
  { recipient, now = new Date() }: Pick<OtpSendContext, 'recipient' | 'now'>
): Promise<OtpRateLimitDecision> {
  const window = await readPhoneWindow(client, recipient, now);
  return evaluateResendBackoff(
    window.map((row) => row.created_at),
    now
  );
}

/** Reads every cap without consuming any. Exported for diagnostics and tests. */
export async function checkOtpSendAllowance(
  client: OtpLedgerClient,
  { recipient, quoteId, now = new Date() }: OtpSendContext
): Promise<OtpRateLimitDecision> {
  // One read covers both recipient windows: the hourly rows are a subset of
  // the daily ones.
  const dayWindow = await readPhoneWindow(client, recipient, now, OTP_PHONE_DAY_WINDOW_MS);
  const hourTimes = hourSubset(dayWindow, now).map((row) => row.created_at);

  const hourly = evaluatePhoneWindow(hourTimes, now);
  if (!hourly.allowed) return hourly;

  const daily = evaluatePhoneWindow(
    dayWindow.map((row) => row.created_at),
    now,
    {
      windowMs: OTP_PHONE_DAY_WINDOW_MS,
      maxSends: OTP_PHONE_DAY_MAX_SENDS,
      scope: 'phone_day',
      error: 'Se alcanzó el límite diario de códigos de verificación. Intente de nuevo mañana.',
    }
  );
  if (!daily.allowed) return daily;

  return evaluateQuoteLifetime(await readQuoteSendCount(client, quoteId));
}

/** Appends one send to the ledger and returns the row that now represents it. */
export async function recordOtpSend(
  client: OtpLedgerClient,
  { recipient, quoteId, channel = null }: OtpSendContext
): Promise<OtpSendLogRow> {
  const { data, error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .insert({
      phone_e164: recipient,
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
 * Flags a reserved send whose delivery failed at the provider (#60).
 *
 * Deliberately an update, not a delete: the row keeps holding its hourly and
 * daily slots (a broken provider stays throttled) while dropping out of the
 * quote's lifetime count (that budget is for codes that reached someone).
 * Throws on a ledger error — the route treats the send as failed either way,
 * and a quote whose slot could not be released is the visible-and-recoverable
 * direction to fail in.
 */
export async function markOtpSendDeliveryFailed(
  client: OtpLedgerClient,
  id: string
): Promise<void> {
  const { error } = await client
    .from(OTP_SEND_LOG_TABLE)
    .update({ delivery_failed: true })
    .eq('id', id);

  if (error) throw ledgerError('delivery-failure flag', error);
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

  const dayWindow = await readPhoneWindow(
    client,
    context.recipient,
    now,
    OTP_PHONE_DAY_WINDOW_MS
  );
  const dayRank = dayWindow.findIndex((row) => row.id === claimed.id);
  const hourWindow = hourSubset(dayWindow, now);
  const hourRank = hourWindow.findIndex((row) => row.id === claimed.id);

  if (dayRank === -1 || hourRank === -1) {
    // The row we just wrote is not in the window we just read, so the ranking
    // cannot be trusted — and neither can any budget derived from it. The
    // plausible cause is clock skew between this function and the database
    // wide enough to place `created_at` outside `windowStart`, which would
    // quietly disable the limit for every caller rather than just this one.
    // Fail closed and make it visible, in keeping with the rest of the module —
    // and without handing the slot back, because refusing to send is the point.
    throw new Error(
      `otp_send_log ranking failed: row ${claimed.id} absent from its own window`
    );
  }

  if (hourRank >= OTP_PHONE_WINDOW_MAX_SENDS || dayRank >= OTP_PHONE_DAY_MAX_SENDS) {
    await releaseOtpSend(client, claimed.id);

    const others = dayWindow.filter((row) => row.id !== claimed.id);
    const hourlyDenial = evaluatePhoneWindow(
      hourSubset(others, now).map((row) => row.created_at),
      now
    );
    if (!hourlyDenial.allowed) return hourlyDenial;

    const dailyDenial = evaluatePhoneWindow(
      others.map((row) => row.created_at),
      now,
      {
        windowMs: OTP_PHONE_DAY_WINDOW_MS,
        maxSends: OTP_PHONE_DAY_MAX_SENDS,
        scope: 'phone_day',
        error: 'Se alcanzó el límite diario de códigos de verificación. Intente de nuevo mañana.',
      }
    );
    if (!dailyDenial.allowed) return dailyDenial;

    // The rank said over-cap but neither window agrees after excluding our
    // row — the reservation was already released, so allowing here would
    // authorize a send the ledger no longer records. Fail closed and loudly.
    throw new Error(
      `otp_send_log ranking failed: row ${claimed.id} over-cap by rank but not by window`
    );
  }

  return { allowed: true, sendId: claimed.id };
}

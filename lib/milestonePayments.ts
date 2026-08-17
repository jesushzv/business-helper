/**
 * The payment ledger for a cobro (#381).
 *
 * `milestones.transferred_amount` is a single scalar that both records *the*
 * declaration and stands in for *everything declared*. Those are the same
 * number only while a cobro is declared exactly once. The moment a payer is
 * asked for a remainder — #371's headline behaviour — the write that records
 * the second payment erases the record of the first, and the cobro reads as
 * permanently short by exactly the first wire with nothing erroring.
 *
 * The founder chose a declarations table over accumulating in place (#381,
 * 2026-08-15): **the SAT expects a complemento de pago per payment**, so rows
 * are the shape the fiscal side already assumes. A running total has forgotten
 * the individual payments by the time a parcialidad needs reconciling.
 *
 * **`transferred_amount` remains the authoritative figure for every money
 * calculation**, and the new total is computed *on that column*
 * (`transferred_amount + amount`, inside `record_milestone_payment`) rather
 * than summed from the ledger. That distinction is the whole correctness
 * argument here, and the first draft got it backwards: deriving the total from
 * the ledger assumes the ledger is complete, and it is not, so a $20,000 wire
 * the owner had recorded was overwritten by the payer's $28,720 — the very
 * defect the table exists to close, reintroduced by the fix for it.
 *
 * **The ledger is not complete, and nothing may present it as if it were.**
 * One writer records into it today: `POST /api/receivables/public/[token]`,
 * the payer's own declaration. The two owner-side writers —
 * `PUT /api/receivables/[id]` and `POST /api/receivables/[id]/confirm` — set
 * `transferred_amount` to an **absolute total**, which is a different statement
 * from "this payment arrived" and cannot be appended to an append-only ledger
 * without inventing money: an owner correcting 20,000 to 25,000 would leave a
 * ledger reading 45,000. Giving them a real per-payment write is a UI decision,
 * not a refactor, and is filed separately. Until it lands, read the column for
 * totals and this table only as the record of what payers declared.
 *
 * Retiring the column is a later change with its own backfill — the deployed
 * code reads it, and migrations are applied by hand after `main` deploys
 * (hard rule #6).
 */

/**
 * Who stated a payment, and the vocabulary the database enforces.
 *
 * Exported as the single statement of the set, with `normalizePaymentSource`
 * answering `null` for anything else rather than the nearest listed value —
 * the #116/#95 rule. `chk_milestone_payments_source` rejects an unknown value,
 * so a write built from an unvalidated string fails the CHECK *after* the
 * caller has been told the payment was recorded.
 */
export const PAYMENT_SOURCES = ['payer_declaration', 'owner_record', 'backfill'] as const;

export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

/** Maps an arbitrary value to a source the CHECK accepts, or `null`. */
export function normalizePaymentSource(value: unknown): PaymentSource | null {
  return typeof value === 'string' && (PAYMENT_SOURCES as readonly string[]).includes(value)
    ? (value as PaymentSource)
    : null;
}

/** One ledger row, as PostgREST returns it — `numeric` arrives as a string. */
export interface MilestonePaymentRow {
  amount: number | string | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * What the ledger says has arrived for one cobro.
 *
 * Rows that cannot be read as a positive amount contribute nothing rather than
 * `NaN` — one unreadable row must not turn the whole total into a figure that
 * renders as "$NaN" next to a CLABE. The database refuses a non-positive
 * amount (`chk_milestone_payments_amount_positive`), so this is a belt on top
 * of a brace, not the enforcement.
 */
export function sumDeclaredPayments(rows: MilestonePaymentRow[] | null | undefined): number {
  if (!Array.isArray(rows)) return 0;

  const total = rows.reduce((sum, row) => {
    const amount = typeof row?.amount === 'string' ? Number(row.amount) : (row?.amount as number);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);

  return round(total);
}

/**
 * The unique index that makes one clave de rastreo, on one cobro, one payment.
 *
 * Matched by name rather than by `23505` alone: the ledger insert can collide
 * on nothing else today, but a future constraint on the table would otherwise
 * be reported to a payer as "your payment is already recorded" — a fabricated
 * success in the shape of a refusal.
 */
const DECLARATION_REPLAY_CONSTRAINT = 'uq_milestone_payments_declaration_reference';

function isDuplicateDeclaration(error: { code?: string; message?: string; details?: string }): boolean {
  if (String(error?.code || '') !== '23505') return false;
  const haystack = `${error?.message || ''} ${error?.details || ''}`;
  return haystack.includes(DECLARATION_REPLAY_CONSTRAINT);
}

export interface RecordMilestonePaymentInput {
  /** Any Supabase client whose role may write the table — service role today. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  milestoneId: string;
  organizationId: string;
  amount: number;
  source: PaymentSource;
  trackingReference?: string | null;
  receiptUrl?: string | null;
}

export type RecordMilestonePaymentResult =
  /**
   * The declaration landed. `total` is the milestone's new
   * `transferred_amount`, returned by the function that wrote it — the value
   * Postgres computed on the row, not one this process worked out and hopes
   * matches (#128).
   */
  | { ok: true; total: number }
  /** Nothing was payable: another request claimed it, or the row is not this tenant's. */
  | { ok: false; reason: 'not_payable' }
  /**
   * This exact declaration is already in the ledger — same cobro, same clave de
   * rastreo (`uq_milestone_payments_declaration_reference`).
   *
   * A clave identifies one SPEI transfer, so the same one twice is a replay,
   * not a second payment. It became reachable by an ordinary double-submit when
   * the payable predicate widened to `marked_paid` (#382): until then the
   * status filter refused the second attempt before it reached the INSERT.
   *
   * Kept distinct from `failed` because the two say opposite things to a payer.
   * "No se pudo registrar el pago" is what a payer transfers *again* after
   * reading — and here the payment is recorded, in full, once.
   */
  | { ok: false; reason: 'duplicate_declaration' }
  /**
   * The write failed. `dbError` carries the **original** PostgREST error where
   * there was one, so the caller can hand it to `publicDbWriteErrorResponse`
   * and keep the distinction that matters to a payer: a `42P01` is a
   * deployment mid-migration ("vuelve a intentar en unos minutos", 503) and
   * anything else is an outage (500). Collapsing them into one flat message is
   * the diagnosis-thrown-away defect (#146/#148) — and 42P01 is the single
   * most likely failure the day this ships, because Vercel deploys `main`
   * before the migration is applied by hand (hard rule #6).
   */
  | { ok: false; reason: 'failed'; code: string; message: string; dbError?: unknown };

/**
 * Records one payment: claims the milestone, appends the ledger row and moves
 * `transferred_amount`, in a single transaction.
 *
 * All three happen inside `record_milestone_payment` rather than here, and the
 * reason is worth stating because the first draft of this module did it the
 * other way and money-path review found three defects in the sequence itself:
 *
 *   - **The total came out wrong for any cobro the owner had already touched.**
 *     Deriving it from the ledger assumed the ledger was complete. It is not —
 *     `PUT /api/receivables/[id]` sets the column and writes no row — so a
 *     $20,000 owner-recorded wire was *overwritten* by the payer's $28,720.
 *     That is the very defect this table exists to close.
 *   - **A failed ledger insert left the milestone claimed with no amount**, and
 *     the retry the payer was told to make answered "ya fue registrado".
 *   - **A failed total write returned 200 with the column NULL**, which reads
 *     as "the full amount arrived" on a confirmed row.
 *
 * The addition now happens on the row (`transferred_amount + amount`), so the
 * authoritative column stays authoritative and the ledger records the
 * individual payment for the fiscal side. Concurrent declarations cannot lose
 * each other's addition the way a read-modify-write from here can.
 */
export async function recordMilestonePayment(
  input: RecordMilestonePaymentInput
): Promise<RecordMilestonePaymentResult> {
  const { supabase, milestoneId, organizationId, amount, source } = input;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      reason: 'failed',
      code: 'INVALID_PAYMENT_AMOUNT',
      message: 'El monto del pago debe ser mayor a cero.',
    };
  }

  if (normalizePaymentSource(source) === null) {
    return {
      ok: false,
      reason: 'failed',
      code: 'INVALID_PAYMENT_SOURCE',
      message: 'No se pudo registrar el origen del pago.',
    };
  }

  const { data, error } = await supabase.rpc('record_milestone_payment', {
    p_milestone_id: milestoneId,
    p_organization_id: organizationId,
    p_amount: amount,
    p_source: source,
    p_tracking_reference: input.trackingReference ?? null,
    p_receipt_url: input.receiptUrl ?? null,
  });

  if (error) {
    // The cause is read, not swallowed (#146/#148). `42P01` here means the
    // migration has not been applied to this deployment yet — the single most
    // likely failure on the day this ships, and the one an operator must be
    // able to tell apart from a constraint violation.
    console.error(
      '[receivables] record_milestone_payment failed. ' +
        `milestone=${milestoneId} amount=${amount} source=${source} ` +
        `code=${error.code} cause=${error.message}`
    );

    // A replay, not an outage — and the transaction rolled back, so the
    // milestone's total is untouched and the ledger holds exactly one row for
    // this clave. Reporting it as a failed write would send a payer who has
    // already paid back to their bank (#382).
    if (isDuplicateDeclaration(error)) {
      return { ok: false, reason: 'duplicate_declaration' };
    }
    return {
      ok: false,
      reason: 'failed',
      code: 'PAYMENT_LEDGER_WRITE_FAILED',
      message: 'No se pudo registrar el pago.',
      dbError: error,
    };
  }

  // NULL is the function's "nothing was payable" answer, and it is a real
  // answer rather than a missing one: the transaction rolled back, so no ledger
  // row exists for the declaration it refused.
  if (data === null || data === undefined) {
    return { ok: false, reason: 'not_payable' };
  }

  const total = typeof data === 'string' ? Number(data) : (data as number);
  if (!Number.isFinite(total)) {
    console.error(
      `[receivables] record_milestone_payment returned an unreadable total: ${String(data)}`
    );
    return {
      ok: false,
      reason: 'failed',
      code: 'PAYMENT_LEDGER_WRITE_FAILED',
      message: 'No se pudo registrar el pago.',
    };
  }

  return { ok: true, total: round(total) };
}

export interface RecordOwnerPaymentInput {
  /** Service-role client: `milestone_payments` is RLS deny-all, so an invoker-rights call cannot insert. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  milestoneId: string;
  organizationId: string;
  amount: number;
  trackingReference?: string | null;
  /** Server-issued storage URL only, never a caller-supplied one (#355/#85). */
  receiptUrl?: string | null;
  /** When the money actually arrived, if the owner said. Defaults to now in the function. */
  declaredAt?: string | null;
}

/**
 * Records a payment the **owner** entered from their own bank (#394, option A).
 *
 * The sibling above records what a *payer* declared over a public link; this
 * records what the tenant saw arrive. They are not equally strong evidence and
 * the ledger keeps them apart (`source`), which is the whole reason the column
 * exists — anything reconciling the ledger has to be able to tell a claim from
 * a bank statement.
 *
 * Two differences from a declaration, both in `record_owner_payment`:
 * **no status change** (an owner is not waiting to confirm their own figure)
 * and **no status filter** (a payment may be recorded against a cobro in any
 * state, including `confirmed` and short — which is how the remainder of a
 * partially-paid cobro reaches the ledger at all, #382).
 *
 * `not_payable` therefore means something narrower here than it does above: not
 * "someone got there first", but "no such milestone in this organization".
 */
export async function recordOwnerPayment(
  input: RecordOwnerPaymentInput
): Promise<RecordMilestonePaymentResult> {
  const { supabase, milestoneId, organizationId, amount } = input;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      reason: 'failed',
      code: 'INVALID_PAYMENT_AMOUNT',
      message: 'El monto del pago debe ser mayor a cero.',
    };
  }

  const { data, error } = await supabase.rpc('record_owner_payment', {
    p_milestone_id: milestoneId,
    p_organization_id: organizationId,
    p_amount: amount,
    p_tracking_reference: input.trackingReference ?? null,
    p_receipt_url: input.receiptUrl ?? null,
    p_declared_at: input.declaredAt ?? null,
  });

  if (error) {
    // Read, never swallowed (#146/#148). `42P01` means this deployment is
    // running `main` with the migration not yet applied by hand (hard rule #6),
    // which an operator must be able to tell from a constraint violation.
    console.error(
      '[receivables] record_owner_payment failed. ' +
        `milestone=${milestoneId} amount=${amount} ` +
        `code=${error.code} cause=${error.message}`
    );
    return {
      ok: false,
      reason: 'failed',
      code: 'PAYMENT_LEDGER_WRITE_FAILED',
      message: 'No se pudo registrar el pago.',
      dbError: error,
    };
  }

  if (data === null || data === undefined) {
    return { ok: false, reason: 'not_payable' };
  }

  const total = typeof data === 'string' ? Number(data) : (data as number);
  if (!Number.isFinite(total)) {
    console.error(
      `[receivables] record_owner_payment returned an unreadable total: ${String(data)}`
    );
    return {
      ok: false,
      reason: 'failed',
      code: 'PAYMENT_LEDGER_WRITE_FAILED',
      message: 'No se pudo registrar el pago.',
    };
  }

  return { ok: true, total: round(total) };
}

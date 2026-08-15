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
 * **`transferred_amount` is still the authoritative figure for every money
 * calculation.** This module is additive: it records what was declared and
 * hands back the ledger total so the caller can keep the column in step. It is
 * deliberately not yet the source of truth — the deployed code reads the
 * column, migrations are applied by hand after `main` deploys (hard rule #6),
 * and the ledger cannot be proven complete until every writer records into it.
 * Retiring the column is a separate change with its own backfill.
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
  | {
      ok: true;
      /**
       * The ledger total **read back after the insert**, not the previous
       * total plus the new amount. #128's rule applied at the call site: a
       * count computed from what the code believes it wrote is the claim, and
       * reading the rows is the evidence. This is the figure the caller writes
       * into `transferred_amount`.
       */
      total: number;
    }
  | { ok: false; code: string; message: string };

/**
 * Appends one payment to the ledger and returns the new total.
 *
 * Insert first, then read: a total computed as `previous + amount` would be
 * wrong for any concurrent declaration, and the two writers on this path — a
 * payer over a public link and the owner in Cobranza — can genuinely overlap.
 *
 * The caller decides what a failure means. It is not this function's place: a
 * failure on the public declaration path must never be reported to the payer
 * as a recorded payment (hard rule #1), while a failure alongside an already
 * successful `transferred_amount` write is a ledger gap to log rather than a
 * reason to tell the tenant their confirmation did not happen.
 */
export async function recordMilestonePayment(
  input: RecordMilestonePaymentInput
): Promise<RecordMilestonePaymentResult> {
  const { supabase, milestoneId, organizationId, amount, source } = input;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      code: 'INVALID_PAYMENT_AMOUNT',
      message: 'El monto del pago debe ser mayor a cero.',
    };
  }

  if (normalizePaymentSource(source) === null) {
    return {
      ok: false,
      code: 'INVALID_PAYMENT_SOURCE',
      message: 'No se pudo registrar el origen del pago.',
    };
  }

  const { error: insertError } = await supabase.from('milestone_payments').insert({
    milestone_id: milestoneId,
    organization_id: organizationId,
    amount,
    source,
    tracking_reference: input.trackingReference ?? null,
    receipt_url: input.receiptUrl ?? null,
  });

  if (insertError) {
    return {
      ok: false,
      code: 'PAYMENT_LEDGER_WRITE_FAILED',
      message: 'No se pudo registrar el pago.',
    };
  }

  const { data: rows, error: readError } = await supabase
    .from('milestone_payments')
    .select('amount')
    .eq('milestone_id', milestoneId)
    .eq('organization_id', organizationId);

  if (readError) {
    // The row is in. Refusing to answer is honest; inventing the total is not.
    return {
      ok: false,
      code: 'PAYMENT_LEDGER_READ_FAILED',
      message: 'El pago se registró, pero no se pudo calcular el total recibido.',
    };
  }

  return { ok: true, total: sumDeclaredPayments(rows as MilestonePaymentRow[]) };
}

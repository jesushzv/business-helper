-- ----------------------------------------------------------------------------
-- milestone_payments — payments become rows (#381, option B)
--
-- `milestones.transferred_amount` is one scalar column that has to answer two
-- different questions: "what did this declaration say" and "how much has
-- arrived in total". While a cobro is declared exactly once — the only flow the
-- product supports today — those are the same number and the column is fine.
--
-- They stop being the same number the moment a payer is asked for a remainder,
-- which is #371's headline behaviour and the reason it shipped informational
-- only. `POST /api/receivables/public/[token]` *replaces* the column, so a
-- payer declaring the balance would erase the record of the first wire:
--
--     after a $20,000 wire        transferred_amount = 20,000   → $28,720 owed
--     after declaring $28,720     transferred_amount = 28,720   → $20,000 owed
--
-- The cobro is paid in full and reads as permanently short by exactly the first
-- payment. Nothing errors.
--
-- The founder chose option B (2026-08-15, recorded on #381): payments become
-- rows. Chosen over accumulating in place because **the SAT expects a
-- complemento de pago per payment** — a table of payments is the shape the
-- fiscal side already assumes, while a running total has forgotten the
-- individual payments by the time a parcialidad needs reconciling.
--
-- What this migration does NOT do, deliberately:
--
--   - It does not drop or rewrite `transferred_amount`. Vercel deploys `main`
--     before migrations are applied by hand (hard rule #6), so the currently
--     deployed code must keep working against this schema. The column stays
--     authoritative for every money calculation in this PR; the ledger is
--     additive. Retiring it is a later, separate change with its own backfill.
--   - It defines no RLS policy. Nothing in the browser reads this table yet,
--     and a table with RLS on and zero policies is unreachable by `anon` and
--     `authenticated` — the same posture as cfdi_stamp_claims and
--     stripe_webhook_events. Tenant read policies arrive with the UI that
--     needs them, not before.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.milestone_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT, matching the deletion invariants #336 applied to the money path:
  -- a milestone with declared payments against it is not something a cascade
  -- may quietly take with it.
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE RESTRICT,

  -- Denormalised on purpose: every tenant query scopes by organization_id
  -- (hard rule #4), and reaching it through milestones on each read makes the
  -- future RLS policy a join.
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Money columns are numeric(12,2) by convention. A payment of zero is not a
  -- payment, and a negative one is a refund this table does not model — both
  -- are refused rather than stored as a fact nothing can read correctly.
  amount numeric(12,2) NOT NULL,

  -- Who stated this payment. The two are not equally strong evidence: a payer
  -- declaration is a claim made over a public link, an owner record is the
  -- tenant entering what their own bank showed. Anything reconciling the
  -- ledger needs to tell them apart, and an unrecognised value is refused
  -- rather than mapped to the nearest listed one (#95).
  source text NOT NULL,

  -- The SPEI clave de rastreo, when the declaration carried one.
  tracking_reference text,

  -- Server-issued storage URL only, never a caller-supplied one (#355/#85).
  receipt_url text,

  declared_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_milestone_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_milestone_payments_source
    CHECK (source IN ('payer_declaration', 'owner_record', 'backfill'))
);

-- The two access paths: everything for one cobro, and everything for one
-- tenant. `declared_at` is in the first because the ledger is read in order —
-- parcialidad numbering is chronological.
CREATE INDEX IF NOT EXISTS idx_milestone_payments_milestone
  ON public.milestone_payments (milestone_id, declared_at);

-- Ordered, because the tenant view this table is heading for lists a
-- organization's payments newest first.
CREATE INDEX IF NOT EXISTS idx_milestone_payments_org
  ON public.milestone_payments (organization_id, declared_at);

-- A clave de rastreo identifies one SPEI transfer, so the same one twice on
-- one cobro is a replay, not a second payment. `stripe_webhook_events` and
-- `cfdi_stamp_claims` both make a replay collide on 23505 rather than trusting
-- the caller not to send one; this ledger had no such anchor, and a doubled row
-- would inflate `transferred_amount` by the duplicate with nothing to detect it
-- afterwards.
--
-- Partial, and only over payer declarations: an owner-recorded wire may
-- legitimately carry no reference at all, and NULLs do not collide anyway.
CREATE UNIQUE INDEX IF NOT EXISTS uq_milestone_payments_declaration_reference
  ON public.milestone_payments (milestone_id, tracking_reference)
  WHERE source = 'payer_declaration' AND tracking_reference IS NOT NULL;

ALTER TABLE public.milestone_payments ENABLE ROW LEVEL SECURITY;

-- RLS with zero policies blocks row access through PostgREST, but Supabase's
-- default privileges still GRANT ALL on a new table to anon and authenticated,
-- and **TRUNCATE is not governed by RLS** — an anon TRUNCATE would delete the
-- payment ledger outright. Revoke the named roles, not just PUBLIC (#76, #242).
REVOKE ALL ON TABLE public.milestone_payments FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Backfill: every milestone that already carries a figure becomes one row.
--
-- Expected count is stated rather than assumed, per #128 — whether a guard
-- fills the rows already there decides what this statement must do, and that
-- migration got it wrong in both directions by reasoning from the SQL instead
-- of measuring. **0 rows changed looks exactly like success**, and on the
-- production database at the time of writing this is expected to insert
-- **exactly 0 rows**: 2 milestones exist and neither has a
-- `transferred_amount`. Read the counts back rather than trusting the exit
-- code:
--
--   SELECT count(*) FROM public.milestones WHERE transferred_amount > 0;  -- 0
--   SELECT count(*) FROM public.milestone_payments;                       -- 0
--
-- The two must be equal after this runs on a database where the ledger was
-- previously empty.
--
-- `WHERE NOT EXISTS` makes re-application a no-op rather than a second copy of
-- every payment: migrations here are idempotent by convention, and this one
-- would otherwise double the ledger on a re-run.
-- ----------------------------------------------------------------------------
INSERT INTO public.milestone_payments
  (milestone_id, organization_id, amount, source, tracking_reference, receipt_url, declared_at)
SELECT
  m.id,
  m.organization_id,
  m.transferred_amount,
  'backfill',
  m.tracking_reference,
  m.receipt_url,
  -- The moment the money was acknowledged, best-effort: the confirmation where
  -- there is one, otherwise the row's creation. Never `now()` — that would date
  -- every historical payment to the migration.
  COALESCE(m.confirmed_at, m.created_at)
FROM public.milestones m
WHERE m.transferred_amount IS NOT NULL
  AND m.transferred_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.milestone_payments p WHERE p.milestone_id = m.id
  );

-- ----------------------------------------------------------------------------
-- record_milestone_payment — the claim, the ledger row and the new total, in
-- one transaction.
--
-- The first draft of this change did the three writes from the route: claim the
-- milestone, insert the ledger row, then set `transferred_amount` from the
-- ledger total read back. Money-path review found three separate defects in
-- that sequence, and all three are properties of it being a sequence:
--
--   1. **The total was wrong for any cobro the owner had already touched.** The
--      ledger holds payer declarations only — `PUT /api/receivables/[id]` sets
--      `transferred_amount` and writes no row — so a milestone carrying an
--      owner-recorded $20,000 with an empty ledger had the column *overwritten*
--      by the payer's $28,720. Identical to the defect this table exists to
--      close, reintroduced by the fix.
--   2. **A failed ledger insert left a torn claim.** The milestone was already
--      `marked_paid` with the clave de rastreo written and no amount anywhere;
--      the retry the payer was told to make hit the status filter and answered
--      "este cobro ya fue registrado" for a payment recorded nowhere. Between a
--      deploy of `main` and this migration being applied by hand (hard rule
--      #6), *every* declaration would have landed in that state.
--   3. **A failed total write returned 200 with the column still NULL**, and
--      NULL on a confirmed row means "the full amount arrived"
--      (lib/receivablesCalculator.ts) — so a $20,000 wire would book as fully
--      collected and the complemento de pago would declare it to the SAT.
--
-- Arithmetic on the row itself (`transferred_amount + p_amount`) is what makes
-- (1) go away: the column is authoritative and complete, the ledger is not, so
-- the new total is derived from the column and the ledger records the
-- individual payment. Postgres reads and writes it inside one statement, so
-- concurrent declarations cannot lose each other's addition the way a
-- read-modify-write from the route can. (2) and (3) go away because a function
-- body is one transaction: either all three effects land or none do.
--
-- **Not `SECURITY DEFINER`** — deliberately, and this is the point of the #76
-- lesson rather than an omission. The only caller is the public route's
-- service-role client, which already bypasses RLS; a definer function would add
-- an ambient-authority surface at `/rest/v1/rpc/` for nothing. Same posture as
-- `increment_ai_usage`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_milestone_payment(
  p_milestone_id uuid,
  p_organization_id uuid,
  p_amount numeric,
  p_source text,
  p_tracking_reference text,
  p_receipt_url text
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_milestone_payment: amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  -- The status filter rides *inside* the write, as it did before: a concurrent
  -- submission or a replay cannot move a milestone backwards out of
  -- `marked_paid`/`confirmed`. Scoped by organization_id too — the follow-up
  -- write in the sequence this replaces had neither, so it could land on a row
  -- another request had confirmed in the meantime.
  --
  -- `receipt_url` is written only when this declaration carries one (#339): a
  -- receipt-less declaration must not erase the comprobante the owner filed on
  -- the client's behalf.
  UPDATE public.milestones
     SET status             = 'marked_paid',
         tracking_reference = p_tracking_reference,
         receipt_url        = COALESCE(p_receipt_url, receipt_url),
         transferred_amount = COALESCE(transferred_amount, 0) + p_amount
   WHERE id              = p_milestone_id
     AND organization_id = p_organization_id
     AND status IN ('pending', 'requested')
   RETURNING transferred_amount INTO v_total;

  -- Zero rows matched: somebody got there first, or the milestone is not this
  -- organization's. NULL tells the caller to answer 409 rather than 200 — and
  -- because this is one transaction, no ledger row is left behind for a
  -- declaration that was refused.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.milestone_payments
    (milestone_id, organization_id, amount, source, tracking_reference, receipt_url)
  VALUES
    (p_milestone_id, p_organization_id, p_amount, p_source, p_tracking_reference, p_receipt_url);

  RETURN v_total;
END;
$$;

-- PostgREST publishes every executable function in `public` at
-- /rest/v1/rpc/<name>, and Supabase grants EXECUTE to anon and authenticated as
-- *named roles* — `REVOKE … FROM PUBLIC` does not touch those (#76). Without
-- this, any visitor could mark any milestone paid for any amount.
REVOKE ALL ON FUNCTION public.record_milestone_payment(uuid, uuid, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_milestone_payment(uuid, uuid, numeric, text, text, text)
  TO service_role;

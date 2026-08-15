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

CREATE INDEX IF NOT EXISTS idx_milestone_payments_org
  ON public.milestone_payments (organization_id);

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

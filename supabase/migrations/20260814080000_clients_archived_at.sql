-- Archiving a client (#337)
--
-- `quotes.client_id` and `contracts.client_id` are ON DELETE RESTRICT
-- (20260803000000_initial_schema.sql:101,128), so any client who has ever been
-- quoted is permanently undeletable — which is the normal case for every client
-- that matters. #262 made that refusal honest and visible; this gives the
-- tenant somewhere to go after reading it.
--
-- Archiving is a **directory-visibility** concept, not a soft delete. The
-- client's quotes, contracts and milestones are untouched and stay exactly as
-- they are: the tenant's own records, and the "evidencia" the product sells.
-- Restoring is just clearing this column.

-- Nullable with NO DEFAULT, deliberately. "Never archived" and "archived" must
-- stay distinguishable, and a DEFAULT now() would archive every existing client
-- on deploy while a DEFAULT null-plus-backfill would collapse the distinction
-- this column exists to hold (#64's tri-state rule, at the column).
--
-- `ADD COLUMN` with no default fills existing rows with NULL, which is exactly
-- the intended value for every one of them: no backfill UPDATE follows, and the
-- expected count of rows changed by one is zero (#128 — a backfill's guard is a
-- claim about rows, so the absence of a backfill is stated rather than implied).
--
-- NOT yet applied to production as of this commit, and not dry-run either —
-- the agent session that wrote it had no SUPABASE_DB_URL. What *has* run: CI's
-- "Migrations against real Postgres" job, and a reviewer's throwaway Postgres
-- 16.13 cluster through scripts/ci-verify-migrations.sh, both of which apply
-- this file and then apply it again cleanly. Reading the column back from
-- production is the step still outstanding (#337).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.clients.archived_at IS
  'When the owner archived this client. NULL = never archived. Directory visibility only: quotes and contracts are untouched (#337).';

-- Every list read is "this organization''s clients that are not archived", so
-- the index carries the predicate. Measured, not assumed: on 60k clients
-- across 200 tenants the active list plans a Bitmap Index Scan on this index
-- (~0.55 ms), and widening it to (organization_id, created_at DESC) did not
-- change the plan.
--
-- The **archived** list has no index of its own and seq-scans (~4.8 ms at that
-- size). Deliberate: it is opened rarely and by one tenant at a time, and an
-- index on the rows nothing routinely reads is the wrong trade. Stated here so
-- the omission reads as a decision rather than an oversight.
--
-- (Not the same thing as bank_accounts'' partial index in 20260811180000 —
-- that one is UNIQUE and enforces "at most one live default per org", a
-- constraint rather than a lookup path.)
CREATE INDEX IF NOT EXISTS idx_clients_org_active
  ON public.clients (organization_id)
  WHERE archived_at IS NULL;

-- No RLS change. The existing clients policies are scoped by organization and
-- say nothing about this column, which is correct — archived rows must stay
-- readable so the archived filter and the restore action can reach them.

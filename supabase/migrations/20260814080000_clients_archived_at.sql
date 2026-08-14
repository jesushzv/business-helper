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
-- The PR reads the row counts back live.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.clients.archived_at IS
  'When the owner archived this client. NULL = never archived. Directory visibility only: quotes and contracts are untouched (#337).';

-- Every list read is "this organization''s clients that are not archived", so
-- the index carries the predicate. Partial on `archived_at IS NULL` for the
-- same reason bank_accounts'' default index is (20260811180000): the archived
-- rows are the ones nothing routinely scans.
CREATE INDEX IF NOT EXISTS idx_clients_org_active
  ON public.clients (organization_id)
  WHERE archived_at IS NULL;

-- No RLS change. The existing clients policies are scoped by organization and
-- say nothing about this column, which is correct — archived rows must stay
-- readable so the archived filter and the restore action can reach them.

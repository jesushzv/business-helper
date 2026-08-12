-- #222 — a concurrent double-POST of quote conversion could insert the
-- milestone schedule twice against one contract: the resume logic (#218) is
-- check-then-act, and nothing at the database level refused a second schedule.
-- Each duplicate milestone is independently payable and CFDI-eligible, so the
-- receivable doubled.
--
-- A unique index on (contract_id, label) would be wrong: POST /api/receivables
-- creates milestones with tenant-authored labels that may legitimately repeat.
-- Instead, conversion-created rows carry their position in the schedule
-- (1..n); manual cobros leave it NULL. Nullable with no default on purpose —
-- NULL means "not created by conversion", which is a fact, not a fallback
-- (the #64 tri-state rule at the column).
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS conversion_position smallint;

-- The partial unique index is the actual fix: whichever concurrent request
-- inserts the schedule second gets 23505 no matter the interleaving, and the
-- convert route answers that by reading back the winner's schedule.
CREATE UNIQUE INDEX IF NOT EXISTS uq_milestones_contract_conversion_position
  ON milestones (contract_id, conversion_position)
  WHERE conversion_position IS NOT NULL;

-- No backfill: rows created before this column exist with complete schedules
-- and quotes already pointing at their contracts, so no code path re-inserts
-- a schedule for them without also carrying positions (which the index then
-- protects). Verified before applying: zero duplicate (contract_id, label)
-- pairs live, and every existing conversion is complete.

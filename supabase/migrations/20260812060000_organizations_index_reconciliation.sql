-- #204 — reconcile the two indexes production holds that no migration created.
--
-- Both were applied by hand at some point and surfaced while building
-- the unique owner index #189 added. Read from the live catalog 2026-08-12
-- before writing this file, per CLAUDE.md's rule; #204's own body also named a
-- *column* (`trial_ends_at`) as undeclared, which is wrong — it is created in
-- `20260811150000_organization_trial.sql` — so this file touches indexes only.
--
--   * `idx_organizations_owner_id` (non-unique btree) is DROPPED: the unique
--     owner index #189 added covers the same column, serves the same
--     lookups, and additionally enforces the one-org-per-owner invariant. The
--     duplicate costs a write on every INSERT/UPDATE of organizations for
--     nothing.
--   * `idx_organizations_trial_ends_at` is DECLARED, matching the live
--     definition byte for byte, so a fresh environment (CI's Postgres, a new
--     deployment) converges to what production already holds. IF NOT EXISTS
--     makes it a no-op against production and a real creation everywhere else.
--
-- Idempotent both ways; safe to re-run.

drop index if exists public.idx_organizations_owner_id;

create index if not exists idx_organizations_trial_ends_at
  on public.organizations using btree (trial_ends_at)
  where (trial_ends_at is not null);

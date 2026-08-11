-- #128 — a 30-day trial, then read-only until a plan is bought.
--
-- The question was what an organization that has never subscribed actually
-- gets. Until now: everything. `subscription_tier` defaulted to 'free' — a tier
-- STRIPE_PLANS has never contained — `subscription_status` defaulted to
-- 'active', and the one function that computed an `isAccessible` flag was read
-- by no route, no middleware and no component. The product was free with
-- metered CFDI and nothing anywhere said so.
--
-- Verified against the live catalog before writing this, per the #96 lesson
-- that a documented column is a claim and only the catalog is evidence:
--
--   chk_subscription_status CHECK (subscription_status = ANY (ARRAY[
--     'active', 'trialing', 'past_due', 'canceled', 'unpaid',
--     'incomplete', 'incomplete_expired']))
--
-- 'trialing' is already permitted, so this migration does **not** touch that
-- constraint. `20260806120000` widened it to the seven Stripe reports; #95 is
-- what happens when application code narrows that set again behind its back.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
-- Nullable with no default, deliberately, and the two facts are independent:
-- NULL means "no trial applies to this organization" — either it is
-- grandfathered or it is paying — which is not the same as a trial that ended.
-- A DEFAULT here would give every future backfill and every hand-inserted row a
-- trial nobody granted, and would make "never had one" unrepresentable. That is
-- the #64/#96 tri-state rule at the column.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'When this organization''s free trial ends. NULL = no trial applies (paying, '
  'or grandfathered by 20260811170000). Only meaningful while '
  'subscription_status = ''trialing''. Read by lib/subscriptionAccess.ts.';

-- ---------------------------------------------------------------------------
-- 2. Grandfather every organization that already exists.
-- ---------------------------------------------------------------------------
-- Both production rows predate this policy and at least one is the founder's.
-- Handing them a trial that expires would lock a real pilot out of creating
-- quotes 30 days after deploy, for a policy they never agreed to — and #68
-- means they could not buy their way out even if they wanted to, because live
-- Stripe cannot take a payment yet.
--
-- `WHERE trial_ends_at IS NULL AND subscription_status = 'trialing'` would be
-- the cautious form, but no row can be 'trialing' yet — this migration
-- introduces the state. The guard that matters is that this runs exactly once
-- against rows created *before* it, which the timestamp ordering gives.
UPDATE public.organizations
SET subscription_status = 'active'
WHERE subscription_status = 'active'   -- no-op by value; see below
  AND trial_ends_at IS NULL;

-- The UPDATE above is intentionally a no-op on value: every pre-existing row is
-- already 'active' by the initial schema's DEFAULT, so grandfathering them is
-- *the absence of a change*. It is written out rather than omitted so the
-- decision is visible in the migration history instead of being implied by
-- silence — a future reader asking "what happened to the rows that existed
-- before trials?" gets an answer here.
--
-- The escape hatch this leaves is deliberate and documented: setting
-- subscription_status = 'active' on any row grants permanent access. While #68
-- blocks live payment that is the only way to extend a pilot whose trial has
-- run out, and it needs no deploy.

-- ---------------------------------------------------------------------------
-- 3. New organizations start on a trial.
-- ---------------------------------------------------------------------------
-- The default lives at the column rather than only in POST /api/organization,
-- so an organization created by any path — a future admin tool, a repair
-- script, a Supabase Studio insert — gets the same terms. The route sets both
-- explicitly as well, which is belt and braces rather than duplication: the
-- route's value is what its tests assert on, and the default is what protects
-- the paths no test covers.
--
-- 30 days is #128's answer, and it is written here as an interval literal
-- rather than read from configuration because a column default cannot see the
-- application's environment. lib/subscriptionAccess.ts holds the same number as
-- TRIAL_PERIOD_DAYS and tests/unit/subscriptionAccess.test.ts fails the build
-- if the two drift apart.
ALTER TABLE public.organizations
  ALTER COLUMN subscription_status SET DEFAULT 'trialing';

ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '30 days');

-- Existing rows are untouched by a DEFAULT change; it applies only to inserts
-- from here. That is what makes step 2 above safe.

-- ---------------------------------------------------------------------------
-- 4. Finding trials about to lapse, without a scan.
-- ---------------------------------------------------------------------------
-- Access is evaluated on read, not by a nightly job, so nothing needs this
-- index to answer a request. It is here for the operational question — which
-- pilots are about to hit the wall — which is a question worth being able to
-- ask cheaply while #68 is open. Partial, so it stays small: a NULL
-- trial_ends_at is the common case for a paying tenant.
CREATE INDEX IF NOT EXISTS idx_organizations_trial_ends_at
  ON public.organizations (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

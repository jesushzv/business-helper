-- #128 — what an organization that has never subscribed actually gets.
--
-- Until now: `subscription_tier` defaulted to 'free', a plan that exists in no
-- price list, `subscription_status` defaulted to 'active', and nothing in the
-- app read either. So the product was silently free with metered CFDI, and a
-- pilot cohort that never meets a paywall produces no signal about willingness
-- to pay — a false negative of exactly the kind the launch framing exists to
-- prevent.
--
-- The decision is a time-boxed trial: a new organization starts `trialing` with
-- an explicit end date, and keeps the whole loop until it expires.
--
-- `trial_ends_at` is nullable and carries a DEFAULT. Both halves are decisions:
--
--  * the default is what actually grants the trial. The app never writes this
--    column on insert, so a deploy that reaches production before this migration
--    is applied still creates organizations — they simply get no trial and read
--    as "unknown", which the resolver treats permissively. Writing it from the
--    route would have made org creation, and therefore onboarding, fail outright
--    in that window (hard rule #6's failure mode, avoided rather than documented);
--
--  * nullable, because NULL still has to mean "no trial recorded" — a paying
--    organization, or a row from before this — which the app must be able to
--    tell apart from "a trial that ended", which is a date in the past.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '30 days');

COMMENT ON COLUMN public.organizations.trial_ends_at IS
  'End of the free trial. NULL = no trial recorded (paying, or predates #128). A past date = the trial ended.';

-- New organizations start in the trial rather than at 'active', which claimed a
-- subscription nobody had. 'trialing' is already accepted by chk_subscription_status
-- (widened in 20260806120000) and validateSubscriptionStatus already reads it as
-- accessible.
ALTER TABLE public.organizations
  ALTER COLUMN subscription_status SET DEFAULT 'trialing';

-- Backfill: every organization that has never checked out gets a trial starting
-- now, not one backdated to its signup (which would expire the pilots already on
-- the system the moment this deploys).
--
-- Scoped away from anyone Stripe knows about: a row with a stripe_subscription_id
-- is a real subscriber whose status belongs to the webhook, and this must never
-- move it.
--
-- The guard is the *status*, not `trial_ends_at IS NULL`, and that distinction
-- is the whole backfill. `ADD COLUMN … DEFAULT` above evaluates the default for
-- every existing row, so by the time this statement runs no row has a NULL
-- trial_ends_at — a NULL check here would match nothing, leave every existing
-- organization on 'active', and the backfill would silently do nothing while
-- reporting success. Caught by counting the candidates on the live database
-- before applying, not by reading the SQL.
--
-- Still idempotent: the first run moves these rows to 'trialing', which the
-- WHERE no longer matches.
UPDATE public.organizations
SET
  subscription_status = 'trialing',
  updated_at = now()
WHERE
  stripe_subscription_id IS NULL
  AND subscription_status = 'active'
  AND subscription_tier = 'free';

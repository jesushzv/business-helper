-- #128, repair. A separate file because 20260811150000 has been applied to
-- production — editing an applied migration leaves the repo and the live
-- database silently disagreeing.
--
-- What the live rows showed after applying it: the status backfill worked, but
-- `trial_ends_at` was still NULL on a pre-existing organization now sitting at
-- `subscription_status = 'trialing'`. `resolveTrialState` reads a trial with no
-- end date as `unknown` — deliberately, since a date-less trial cannot be said
-- to have expired — so that tenant is in a trial nothing will ever display or
-- enforce.
--
-- The cause is the assumption `ADD COLUMN … DEFAULT` fills every existing row,
-- which is why the earlier fix dropped `trial_ends_at` from the backfill's SET.
-- Reading the rows back after applying is what showed it does not hold here.
-- The lesson is the repo's own: a migration is proven by the state it leaves,
-- never by the fact that it ran.
--
-- Idempotent and non-destructive: it only ever fills a NULL, so a second run
-- matches nothing and no existing end date is moved. Scoped to `trialing` rows,
-- so it cannot invent a trial for a subscriber or for a row deliberately left
-- with no trial recorded.

UPDATE public.organizations
SET
  trial_ends_at = now() + interval '30 days',
  updated_at = now()
WHERE
  subscription_status = 'trialing'
  AND trial_ends_at IS NULL;

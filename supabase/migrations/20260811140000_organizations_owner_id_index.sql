-- `organizations.owner_id` had no index at all (#168).
--
-- Verified against the live catalog rather than the migrations, because
-- `docs/02-architecture/database-schema-design.md` asserted an index here that
-- was never created — the #96 class, a document describing schema that does not
-- exist. What production actually carries on this table is three indexes:
-- `organizations_pkey`, `organizations_stripe_customer_id_key` and
-- `organizations_stripe_subscription_id_key`. None covers `owner_id`.
--
-- The column is on the hot path of every authenticated request:
-- `requireOrgAccess()` resolves the caller's organization by `owner_id` before
-- any route body runs, and `user_organization_ids()` — the function behind nine
-- RLS policies since #146 — unions a second `owner_id = auth.uid()` lookup into
-- every tenant-scoped read. Two sequential scans per request against a table
-- that grows with the customer base.
--
-- Deliberately NOT unique. #109 asked whether one organization per owner is a
-- product invariant and the answer taken was **no** — multi-org ownership stays
-- possible, and the application code is what changes to stop assuming a single
-- owned row (see `lib/apiAuth.ts` and `app/api/organization/route.ts` in the
-- same PR). A unique index here would foreclose that. If the decision is ever
-- reversed, the index to add is
--   CREATE UNIQUE INDEX uq_organizations_owner_id ON public.organizations (owner_id);
-- and it must be preceded by a check that no owner already holds two rows,
-- since the build fails otherwise.

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON public.organizations (owner_id);

COMMENT ON INDEX public.idx_organizations_owner_id IS
  'Owner lookup for requireOrgAccess() and user_organization_ids(). Non-unique '
  'by decision (#109): an owner may hold more than one organization, so every '
  'owner-scoped write filters by organization id as well as owner_id.';

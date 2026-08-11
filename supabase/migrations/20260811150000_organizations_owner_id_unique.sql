-- ============================================================================
-- One organization per owner, enforced by the schema (#168, deciding #109)
--
-- `organizations.owner_id` had no index and no uniqueness guarantee — only the
-- FK to auth.users. Two separate problems came out of that, and one index
-- closes both.
--
-- 1. No index. Every owner-scoped read and write filters on `owner_id`
--    (`app/api/organization/route.ts`, `lib/apiAuth.ts`), and
--    `database-schema-design.md` claimed an `IDX` that the live catalog did not
--    have — the #96 class, a document describing schema nobody created.
--
-- 2. Nothing prevented one user owning two organizations, while the write path
--    assumed they could not. `.eq('owner_id', userId).maybeSingle()` fails
--    PostgREST's singular-response check with two rows, so such an owner would
--    get **404 "No se encontró una organización propia"** — told their business
--    does not exist — on every attempt to save or remove their settlement
--    account. `requireOrgAccess` would meanwhile resolve their tenant by
--    `LIMIT 1`, which #133 made deterministic but could not make *correct*:
--    ordering picks the same row every time, not the right one.
--
-- The product answer (#109) is that one organization per owner IS the
-- invariant — the code has assumed it everywhere since the first route — so it
-- belongs in the schema rather than in a UI guarantee standing in for one.
--
-- A UNIQUE index, not a plain index plus a unique one. #168's sketch proposed
-- both; a unique btree on (owner_id) already serves `owner_id = $1` exactly as
-- a plain btree does, so the second would be dead weight paid for on every
-- INSERT and UPDATE of the table.
--
-- Safe to build: `owners_with_multiple_orgs` was verified 0 against production
-- on 2026-08-11 before this ran. If a future database holds a duplicate the
-- build fails loudly here rather than corrupting anything, which is the
-- behaviour we want.
--
-- What this does NOT do: multi-organization ownership stays impossible until
-- the routes take an organization id instead of deriving one from `owner_id`.
-- That is the larger change #168 describes, and it now needs this index
-- dropped first — deliberately, so it cannot happen by accident.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_owner_id
  ON public.organizations (owner_id);

COMMENT ON INDEX public.uq_organizations_owner_id IS
  'One organization per owner (#109/#168). Also the index every owner_id-scoped '
  'read needs; a separate non-unique index would be redundant.';

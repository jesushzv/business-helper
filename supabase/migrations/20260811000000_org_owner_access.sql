-- An organization's owner could not read or write any of its data.
--
-- `user_organization_ids()` is the whole of the tenant check: nine RLS policies
-- are `organization_id IN (SELECT public.user_organization_ids())`, on clients,
-- quotes, contracts, milestones, products, audit_logs, cfdi_payment_complements,
-- organization_invitations and organization_members. It resolved membership from
-- `organization_members` alone:
--
--     SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
--
-- Nothing creates a member row for the person who *owns* the organization.
-- Both organizations in production have `owner_has_member_row = false`, so for
-- their owners the function returned the empty set and every one of those nine
-- policies denied everything.
--
-- The application layer disagreed, which is what made it so hard to see.
-- `requireOrgAccess()` resolves the caller's organization from
-- `organizations.owner_id` first and hands back `role: 'owner'`, so auth
-- succeeded, the route ran, and the INSERT was then refused by the database
-- with `42501` — surfaced to the founder as "No se pudo crear el cliente"
-- (#146). The `organizations` table's own policy already says "owned or member",
-- so the org row was visible while none of its contents were: the two halves of
-- the same rule had drifted apart.
--
-- Confirmed live before writing this, by impersonating the owner's JWT:
--   user_organization_ids() → 0 rows
--   INSERT INTO clients     → 42501 new row violates row-level security policy
--   INSERT INTO quotes      → 42501 new row violates row-level security policy
-- and after applying this definition in a rolled-back transaction:
--   user_organization_ids() → 1 row
--   INSERT INTO clients (own org)      → SUCCEEDED
--   INSERT INTO clients (other tenant) → 42501, still refused
--
-- Ownership is added as a UNION rather than by backfilling member rows. A
-- backfill fixes the two organizations that exist and leaves the trap armed for
-- the next one; and it would put ownership in two places that can disagree,
-- which is this defect exactly. `organizations.owner_id` stays the single fact.
-- UNION, not UNION ALL: an owner who also holds a member row yields one id.
--
-- Multi-tenant isolation is unchanged (hard rule 4) — this widens the set to
-- organizations the caller owns, which they already had full access to through
-- the `organizations` policy and `requireOrgAccess`. It grants nothing that
-- crosses a tenant boundary.

CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned so the function cannot be captured by a caller-controlled search_path.
SET search_path = public, pg_temp
AS $function$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  UNION
  SELECT id
  FROM public.organizations
  WHERE owner_id = auth.uid();
$function$;

COMMENT ON FUNCTION public.user_organization_ids() IS
  'Organizations the caller may act on: those they are a member of, plus those they own. '
  'Owner-only organizations were excluded until #146, which denied an owner every write '
  'against their own tenant. Called from nine RLS policies.';

-- EXECUTE is deliberately NOT revoked from anon/authenticated here, unlike every
-- other SECURITY DEFINER function in this schema (#76). The nine policies that
-- call it are evaluated as the querying role, so revoking would deny every
-- tenant read instead of protecting anything. The function is safe to expose:
-- it takes no arguments and is scoped entirely by `auth.uid()`, so a caller
-- reaching /rest/v1/rpc/user_organization_ids learns only their own ids.
-- tests/unit/securityDefinerGrants.test.ts holds this as its one exemption.

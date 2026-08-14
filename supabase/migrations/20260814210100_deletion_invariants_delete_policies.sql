-- ----------------------------------------------------------------------------
-- Deletion invariants at the database layer, part 2 of 2:
-- restrictive FOR DELETE policies on quotes and milestones (#336)
--
-- Implements sub-decision 3 of #328.
--
-- The existing policies are `FOR ALL TO authenticated USING (org check)`
-- (20260803000000_initial_schema.sql). `FOR ALL` covers DELETE, so any
-- authenticated org member can take their session JWT straight to PostgREST
-- and delete a *converted* quote — the OTP legal evidence — bypassing both the
-- `delete_records` capability and the status guard, neither of which exists
-- anywhere but in the route handler.
--
-- Postgres combines permissive policies with OR and restrictive policies with
-- AND. So a RESTRICTIVE policy adds a condition every DELETE must satisfy on
-- top of whatever the permissive tenant policy already allows, without
-- touching SELECT/INSERT/UPDATE and without having to restate the org check.
--
-- Scope, stated honestly: these bind `authenticated` (and `anon`, which has no
-- delete grant here anyway). The service role bypasses RLS entirely and is
-- unaffected — by design, since the issue route and the webhook receiver need
-- it — so this closes the JWT-to-PostgREST path, not every path.
--
-- The predicates deliberately mirror the app-layer guards rather than
-- inventing new ones:
--   quotes     — DELETABLE_QUOTE_STATUSES in app/api/quotes/[id]/route.ts
--   milestones — the .eq('status','pending').eq('cfdi_status','none') pair
--                inside the DELETE in app/api/receivables/[id]/route.ts
-- `tests/unit/deletePolicyPredicates.test.ts` fails the build if the two ever
-- drift apart.
-- ----------------------------------------------------------------------------

-- Quotes: only a quote that has not been signed or converted may be deleted.
DROP POLICY IF EXISTS "Deletable quote statuses only" ON public.quotes;
CREATE POLICY "Deletable quote statuses only"
ON public.quotes AS RESTRICTIVE FOR DELETE TO authenticated, anon
USING (
  status IN ('draft', 'sent', 'rejected', 'expired')
);

-- Milestones: only a cobro nothing has happened to yet. Once the payment loop
-- starts or a CFDI exists for it, the row is a money/fiscal record — and
-- deleting it would CASCADE its complementos de pago away with it.
DROP POLICY IF EXISTS "Deletable milestone states only" ON public.milestones;
CREATE POLICY "Deletable milestone states only"
ON public.milestones AS RESTRICTIVE FOR DELETE TO authenticated, anon
USING (
  status = 'pending' AND cfdi_status = 'none'
);

-- ============================================================================
-- Business Helper — Restrict the folio RPCs to the service role, for real
-- Migration: 20260808030000_folio_rpc_grants.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- 20260807120000_cfdi_pac_integration.sql intended these two functions to be
-- callable only by the stamping route:
--
--   REVOKE ALL ON FUNCTION public.reserve_cfdi_folio(...) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.reserve_cfdi_folio(...) TO service_role;
--
-- That does not achieve it. Supabase's default privileges grant EXECUTE on
-- functions created in `public` to `anon` and `authenticated` as named roles,
-- and `REVOKE ... FROM PUBLIC` removes only the implicit PUBLIC grant — it
-- leaves a role-specific one untouched. Inspection of the deployed database on
-- 2026-08-08 confirmed both functions were executable by anon and
-- authenticated.
--
-- Both are SECURITY DEFINER and UPDATE `organizations` directly, so RLS does
-- not contain them. Any signed-in user could call
--
--   POST /rest/v1/rpc/release_cfdi_folio
--   { "p_organization_id": "<their own org>", "p_period": "...", "p_source": "purchased" }
--
-- once per folio they wanted, granting themselves unlimited stamps against the
-- platform's PAC account — a direct cost channel — or call reserve_ to burn
-- another tenant's allowance.
--
-- Nothing in the application loses access: both call sites use the
-- service-role client after their own capability check
-- (app/api/invoices/issue/route.ts, lib/complementoPago.ts).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.reserve_cfdi_folio(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_cfdi_folio(uuid, text, text) FROM anon, authenticated;

-- Re-assert the intended grant, so this file is complete on a fresh database
-- where it runs after the function definitions.
GRANT EXECUTE ON FUNCTION public.reserve_cfdi_folio(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cfdi_folio(uuid, text, text) TO service_role;

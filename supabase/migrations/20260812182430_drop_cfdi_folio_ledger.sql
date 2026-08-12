-- Drop the CFDI folio ledger (#224).
--
-- The BYOK decision (docs/STATUS.md §05, #220/#221) removed platform-side
-- stamping: tenants stamp through their own PAC, which bills them directly,
-- so nothing meters folios. PR #225 removed every reader and caller; this
-- migration removes the storage.
--
-- Measured before writing (2026-08-12, production): 1 organization, and
-- cfdi_folios_used = 0, cfdi_folios_purchased = 0, cfdi_folios_period IS NULL
-- on every row — the drop discards no data. Both functions carried EXECUTE
-- for postgres/service_role only (#76), so no client-facing surface changes.

DROP FUNCTION IF EXISTS public.reserve_cfdi_folio(p_organization_id uuid, p_period text, p_included integer);
DROP FUNCTION IF EXISTS public.release_cfdi_folio(p_organization_id uuid, p_period text, p_source text);

ALTER TABLE public.organizations DROP COLUMN IF EXISTS cfdi_folios_used;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS cfdi_folios_period;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS cfdi_folios_purchased;

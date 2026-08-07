-- ============================================================================
-- Business Helper — Real CFDI 4.0 issuance through a PAC
-- Migration: 20260807120000_cfdi_pac_integration.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- `/api/invoices/issue` fabricated an id and two storage.businesshelper.mx URLs
-- and wrote them onto the milestone as `cfdi_status = 'issued'`. No PAC was
-- contacted, so the product recorded — and showed the user — a stamped invoice
-- the SAT has never seen. This migration provides the schema the real
-- integration needs, and cleans up the records the simulation left behind.
--
--   01. pac_connections — the organization's own PAC API key, sealed
--   02. Folio ledger on organizations + reserve/release functions
--   03. CFDI columns on milestones, and a status domain that has room for
--       cancellation and failure
--   04. Quarantine of the fabricated stamps already in the table
--   05. Private cfdi-documents bucket for the XML/PDF the PAC returns
--   06. Removal of csd_credentials
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 01. PAC connections
--
-- docs/02-architecture/cfdi_integration_architecture.md §02 is explicit that
-- Business Helper never holds a user's CSD (.cer/.key/password). The user keeps
-- those with their PAC and gives us an API key — a revocable string that stamps
-- on their behalf and nothing else.
--
-- The key is stored sealed (AES-256-GCM, see lib/pacCredentials.ts); the
-- keying material lives in PAC_ENCRYPTION_KEY, never in the database. The
-- ciphertext is still restricted to the organization owner: the policy on
-- `organizations` grants every member access to that row, and a member has no
-- reason to hold even the sealed form. The stamping route reads this table with
-- the service role after running its own capability check.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pac_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'facturapi',
  -- 'v1.<iv>.<tag>.<ciphertext>' — never a plaintext key.
  api_key_sealed text NOT NULL,
  -- Last four characters, so the UI can show which key is connected without
  -- being able to reconstruct it.
  api_key_hint text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_pac_provider CHECK (provider IN ('facturapi')),
  CONSTRAINT chk_pac_environment CHECK (environment IN ('sandbox', 'live'))
);

ALTER TABLE public.pac_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pac_connections FROM anon;

CREATE POLICY "Organization owners manage their PAC connection"
ON public.pac_connections FOR ALL TO authenticated
USING (
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);

-- ----------------------------------------------------------------------------
-- 02. Folio ledger
--
-- lib/stripe.ts already prices folios per tier (0 / 10 / 50 included, packs of
-- 50 and 200 on top) but nothing counted them, so the allowance existed only in
-- marketing copy. These columns are the counter, and they only govern stamps
-- made with the platform's PAC account: an organization that connects its own
-- PAC is billed by that PAC directly and is not metered here.
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cfdi_folios_used integer NOT NULL DEFAULT 0,
  -- 'YYYY-MM' of the period cfdi_folios_used counts. A different value means
  -- the included allowance has rolled over.
  ADD COLUMN IF NOT EXISTS cfdi_folios_period text,
  -- Folios bought as a pack. These do not expire with the month.
  ADD COLUMN IF NOT EXISTS cfdi_folios_purchased integer NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_cfdi_folios_non_negative;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_cfdi_folios_non_negative
  CHECK (cfdi_folios_used >= 0 AND cfdi_folios_purchased >= 0);

-- Reserves one folio for the period, consuming the included allowance first and
-- falling back to purchased folios.
--
-- Two concurrent stamps must not both spend the last folio, so the row is taken
-- with FOR UPDATE rather than read-then-written from the route. The reservation
-- names the bucket it took from so release_cfdi_folio can put it back when the
-- PAC rejects the stamp.
CREATE OR REPLACE FUNCTION public.reserve_cfdi_folio(
  p_organization_id uuid,
  p_period text,
  p_included integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_purchased integer;
  v_period text;
BEGIN
  SELECT cfdi_folios_used, cfdi_folios_purchased, cfdi_folios_period
    INTO v_used, v_purchased, v_period
    FROM public.organizations
   WHERE id = p_organization_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'organization_not_found');
  END IF;

  -- A new month resets what the plan includes, never what was paid for.
  IF v_period IS DISTINCT FROM p_period THEN
    v_used := 0;
  END IF;

  IF v_used < p_included THEN
    v_used := v_used + 1;

    UPDATE public.organizations
       SET cfdi_folios_used = v_used,
           cfdi_folios_period = p_period
     WHERE id = p_organization_id;

    RETURN jsonb_build_object(
      'granted', true, 'source', 'included',
      'used', v_used, 'included', p_included, 'purchased', v_purchased
    );
  END IF;

  IF v_purchased > 0 THEN
    v_purchased := v_purchased - 1;

    UPDATE public.organizations
       SET cfdi_folios_used = v_used,
           cfdi_folios_period = p_period,
           cfdi_folios_purchased = v_purchased
     WHERE id = p_organization_id;

    RETURN jsonb_build_object(
      'granted', true, 'source', 'purchased',
      'used', v_used, 'included', p_included, 'purchased', v_purchased
    );
  END IF;

  -- Still record the rollover, so the next call does not re-read a stale period.
  UPDATE public.organizations
     SET cfdi_folios_used = v_used,
         cfdi_folios_period = p_period
   WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'granted', false, 'reason', 'quota_exhausted',
    'used', v_used, 'included', p_included, 'purchased', v_purchased
  );
END;
$$;

-- Returns a reserved folio when the stamp did not happen. A user must not lose
-- a folio to the PAC being unreachable.
CREATE OR REPLACE FUNCTION public.release_cfdi_folio(
  p_organization_id uuid,
  p_period text,
  p_source text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source = 'purchased' THEN
    UPDATE public.organizations
       SET cfdi_folios_purchased = cfdi_folios_purchased + 1
     WHERE id = p_organization_id;
    RETURN;
  END IF;

  -- Only refund the included allowance inside the period it was taken from;
  -- after a rollover the counter it belongs to no longer exists.
  UPDATE public.organizations
     SET cfdi_folios_used = GREATEST(cfdi_folios_used - 1, 0)
   WHERE id = p_organization_id
     AND cfdi_folios_period IS NOT DISTINCT FROM p_period;
END;
$$;

-- Both functions are SECURITY DEFINER and are called by the stamping route with
-- the service role. No end-user role may spend or mint folios directly.
REVOKE ALL ON FUNCTION public.reserve_cfdi_folio(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_cfdi_folio(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_cfdi_folio(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cfdi_folio(uuid, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 03. CFDI columns on milestones
--
-- cfdi_id held a fabricated `cfdi_<timestamp>_<random>`. A real stamp produces
-- two distinct identifiers: the PAC's own invoice id (used to cancel or
-- re-download) and the SAT's UUID / folio fiscal (what the taxpayer and their
-- accountant actually reference). Both are recorded.
--
-- The XML and PDF are kept as bucket paths rather than URLs. The public URL of
-- a private object is not fetchable, and a signed one expires — storing either
-- in a column would recreate the original bug in a subtler form: a link that
-- looks like evidence and resolves to nothing.
-- ----------------------------------------------------------------------------
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS cfdi_uuid text,
  ADD COLUMN IF NOT EXISTS cfdi_provider text,
  ADD COLUMN IF NOT EXISTS cfdi_xml_path text,
  ADD COLUMN IF NOT EXISTS cfdi_pdf_path text,
  ADD COLUMN IF NOT EXISTS cfdi_stamped_at timestamptz,
  ADD COLUMN IF NOT EXISTS cfdi_cancelled_at timestamptz,
  -- A PAC sandbox returns a structurally complete document with no fiscal
  -- validity. Recording which account stamped it is what stops a test document
  -- from being read later as a filed invoice.
  ADD COLUMN IF NOT EXISTS cfdi_environment text,
  -- Why the last attempt failed, in the user's language. Without it a failed
  -- stamp is indistinguishable from one never attempted.
  ADD COLUMN IF NOT EXISTS cfdi_error text;

-- The SAT UUID is unique per stamped document; a duplicate means the same
-- document was recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_cfdi_uuid
  ON public.milestones (cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL;

-- The domain was ('none','pending','issued','failed'). The interim mitigation
-- wrote 'simulated', which this constraint rejected outright — so on a deployed
-- database that write failed and the route reported a stamping error. The
-- domain now covers the states a real document moves through, and 'simulated'
-- is deliberately not one of them: nothing in this codebase may record a stamp
-- that did not happen.
--
-- Dropped here and re-added after the quarantine below, so the rewrite of any
-- 'simulated' row is not itself blocked by the constraint being installed.
ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS chk_milestone_cfdi_status;

-- ----------------------------------------------------------------------------
-- 04. Quarantine the fabricated stamps
--
-- Rows written before the mitigation carry cfdi_status = 'issued' with
-- storage.businesshelper.mx URLs. A business reading its own dashboard would
-- believe it had invoiced those clients — and could file accordingly. They are
-- demoted to 'failed' with an explanation, and the URLs that resolve to nothing
-- are cleared. The old cfdi_id is not preserved: it never identified anything.
-- ----------------------------------------------------------------------------
UPDATE public.milestones
   SET cfdi_status = 'failed',
       cfdi_id = NULL,
       cfdi_xml_url = NULL,
       cfdi_pdf_url = NULL,
       cfdi_error = 'Este timbrado fue simulado por una versión anterior de la aplicación: nunca se emitió ante el SAT. Vuelve a timbrar la factura.'
 WHERE cfdi_status IN ('issued', 'simulated')
   AND (
     cfdi_xml_url LIKE '%storage.businesshelper.mx%'
     OR cfdi_pdf_url LIKE '%storage.businesshelper.mx%'
     OR cfdi_id LIKE 'cfdi\_%'
   );

ALTER TABLE public.milestones
  ADD CONSTRAINT chk_milestone_cfdi_status
  CHECK (cfdi_status IN ('none', 'pending', 'issued', 'failed', 'cancelled'));

ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS chk_milestone_cfdi_environment;
ALTER TABLE public.milestones
  ADD CONSTRAINT chk_milestone_cfdi_environment
  CHECK (cfdi_environment IS NULL OR cfdi_environment IN ('sandbox', 'live'));

-- ----------------------------------------------------------------------------
-- 05. CFDI document storage
--
-- The XML is the fiscal document; the PDF is its human-readable
-- representation. Both are downloaded from the PAC at stamping time and kept
-- here, so the tenant still has them if their PAC account lapses.
--
-- The bucket is private and carries no policy: nothing reaches it with an
-- end-user JWT. Downloads go through /api/invoices/[id]/document, which checks
-- the session and the organization before signing a short-lived URL.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cfdi-documents', 'cfdi-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 06. Remove csd_credentials
--
-- The table modelled certificate_base64 / private_key_encrypted /
-- password_encrypted — a user's CSD. Nothing ever wrote to it, and per §02 of
-- the integration architecture nothing ever should: the whole trust argument
-- ("nunca almacenamos tus certificados SAT") depends on that data not existing
-- here. Its RLS policy also granted every member of an organization access,
-- including the `member` role.
--
-- Dropping it removes a place for those files to accidentally land. If a
-- signing model that needs them is ever adopted (Option B, browser-side
-- signing, §03), the keys stay on the user's device by design and this table
-- would still be the wrong home.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.csd_credentials;

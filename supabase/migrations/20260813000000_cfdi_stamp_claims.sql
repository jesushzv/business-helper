-- ----------------------------------------------------------------------------
-- CFDI stamp claims (#213)
--
-- Facturapi's external_id deduplicates nothing (verified live 2026-08-12, #26):
-- two POSTs with an identical external_id each stamped a document. The route's
-- ALREADY_ISSUED pre-check is check-then-act — two concurrent requests both
-- pass the read, both stamp — and in the timeout case the first request dies
-- before writing the milestone, so even a serial retry passes it. A CFDI
-- cannot be un-issued, only cancelled with a motive, on record with the SAT.
--
-- Same shape as stripe_webhook_events: insert a claim row BEFORE calling the
-- PAC, and let the primary key make the second claimant collide (23505) instead
-- of stamping. On definitive PAC failure the claim is deleted so a genuine
-- retry can proceed; on timeout it is kept — the document may exist — and a
-- stale claim is released only after the PAC's invoice list confirms no
-- document carries the external_id.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cfdi_stamp_claims (
  milestone_id uuid PRIMARY KEY REFERENCES public.milestones(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claimed_by uuid,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfdi_stamp_claims_org
  ON public.cfdi_stamp_claims (organization_id);

ALTER TABLE public.cfdi_stamp_claims ENABLE ROW LEVEL SECURITY;

-- No policy is defined on purpose, exactly as with stripe_webhook_events: the
-- claim ledger is written only by the service-role client in the issue route,
-- which bypasses RLS. With RLS on and zero policies, anon and authenticated
-- can neither read nor write it.

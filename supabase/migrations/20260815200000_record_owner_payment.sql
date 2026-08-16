-- ----------------------------------------------------------------------------
-- record_owner_payment — the owner's own wire becomes a ledger row (#394, option A)
--
-- `milestone_payments` (#381) has had exactly one writer since it shipped: the
-- payer's declaration through `POST /api/receivables/public/[token]`. The two
-- owner-side routes write `milestones.transferred_amount` as an **absolute
-- total** and record nothing, so the ledger is a partial record of what payers
-- said — and a partial ledger is worse than none, because the first consumer to
-- sum it and call it "recibido" reintroduces the defect #381 closed.
--
-- The founder chose option A (2026-08-15, recorded on #394): the owner records
-- *a payment*, not a total. This is the write path for that.
--
-- Why a second function rather than a parameter on the first: applied
-- migrations are never edited (LESSONS), and `record_milestone_payment` cannot
-- serve this case anyway. Its UPDATE hardcodes `status = 'marked_paid'` and
-- filters `AND status IN ('pending','requested')`, both of which are correct
-- for a payer declaration and wrong for an owner record:
--
--   - **No status change here.** `marked_paid` means "a declaration is waiting
--     for the owner to confirm it". An owner recording their own bank's figure
--     is not waiting for themselves. Status transitions stay with the confirm
--     route, which is the one place that turns owed into collected.
--   - **No status filter here.** An owner may record a payment against a cobro
--     in any state — including `confirmed` and short, which is precisely how
--     the remainder of a partially-paid cobro gets into the ledger (#382).
--     Tenancy is still enforced: `organization_id` is matched on the row, and
--     the only caller reaches this behind `requireOrgAccess()` plus the
--     `confirm_payment` capability.
--
-- Arithmetic on the row (`transferred_amount + p_amount`), not a sum read back
-- from the ledger, for the reason #381's migration gives at length: the column
-- is authoritative and complete, the ledger is not (that is what this migration
-- begins to fix, and it is not finished until the confirm route follows). Two
-- concurrent records cannot lose each other's addition the way a
-- read-modify-write from the route can.
--
-- Not `SECURITY DEFINER`, same as its sibling and for the same reason (#76):
-- the only caller is a service-role client, which already bypasses RLS, so a
-- definer function would add an ambient-authority surface at /rest/v1/rpc/ for
-- nothing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_owner_payment(
  p_milestone_id uuid,
  p_organization_id uuid,
  p_amount numeric,
  p_tracking_reference text,
  p_receipt_url text,
  p_declared_at timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  -- chk_milestone_payments_amount_positive would refuse this at the INSERT
  -- below, but a CHECK violation surfaces as a 500 with a constraint name in
  -- it. The caller needs to tell "you typed zero" apart from "the database is
  -- unreachable" (#146's thrown-away diagnosis), so it is refused here with a
  -- code of its own.
  --
  -- A correction downward is deliberately NOT modelled: option A records
  -- payments, and a negative payment is a refund this ledger does not hold.
  -- The route says so in words rather than letting the CHECK say it in SQL.
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_owner_payment: amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  -- `COALESCE(p_x, x)` on both nullable columns: an owner recording a second
  -- wire that carries no clave must not erase the clave the first one carried,
  -- and must not erase a comprobante already filed against the cobro (#339).
  UPDATE public.milestones
     SET transferred_amount = COALESCE(transferred_amount, 0) + p_amount,
         tracking_reference = COALESCE(p_tracking_reference, tracking_reference),
         receipt_url        = COALESCE(p_receipt_url, receipt_url)
   WHERE id              = p_milestone_id
     AND organization_id = p_organization_id
   RETURNING transferred_amount INTO v_total;

  -- No row: the milestone does not exist, or it is not this organization's.
  -- NULL tells the caller to answer 404 rather than 200 — and because a
  -- function body is one transaction, no ledger row is left behind for a
  -- payment that was refused.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.milestone_payments
    (milestone_id, organization_id, amount, source, tracking_reference, receipt_url, declared_at)
  VALUES
    (p_milestone_id, p_organization_id, p_amount, 'owner_record', p_tracking_reference,
     p_receipt_url, COALESCE(p_declared_at, now()));

  RETURN v_total;
END;
$$;

-- PostgREST publishes every executable function in `public` at
-- /rest/v1/rpc/<name>, and Supabase grants EXECUTE to anon and authenticated as
-- *named roles* — `REVOKE … FROM PUBLIC` does not touch those (#76). Without
-- this, any visitor could add any amount to any tenant's cobro.
REVOKE ALL ON FUNCTION public.record_owner_payment(uuid, uuid, numeric, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_payment(uuid, uuid, numeric, text, text, timestamptz)
  TO service_role;

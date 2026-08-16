-- ----------------------------------------------------------------------------
-- record_milestone_payment — a cobro with a balance stays payable (#382)
--
-- `20260815120000_milestone_payments.sql` created this function with
-- `AND status IN ('pending','requested')` in its write. That filter is the
-- backwards-move guard: it is what stops a replayed declaration from rewriting
-- a `confirmed` milestone back to `marked_paid` and destroying the confirmed
-- record's evidence.
--
-- It also closed the link on any client who pays in two goes:
--
--   1. Client wires $20,000 of a $48,720 cobro and declares it
--      → `marked_paid`, one ledger row, $28,720 still owed.
--   2. Client returns to the same `/pay/` link to send the rest
--      → 409, "este cobro ya fue registrado", forever.
--
-- Cobranza went on showing the $28,720 as owed — correctly, since #253 — and
-- the product that exists to close quote → sign → pay → confirm had no path
-- through the *pay* step for the remainder. For a $48,720 anticipo that is not
-- an edge case.
--
-- `marked_paid` therefore joins the filter. Nothing is un-confirmed by it:
-- `confirmed` stays excluded here and in `pickPayableMilestone`, so the guard
-- the filter was written for is intact. A confirmed-and-short cobro is still
-- unreachable from the payer's link — crediting a new declaration against it
-- would either book the payer's unconfirmed claim as revenue or, by moving the
-- status back, erase the confirmed part from every KPI. That needs
-- per-payment confirmation and is tracked separately; meanwhile **Registrar
-- pago** (#394) records the remainder from the owner's side.
--
-- **No balance precondition in the SQL, deliberately.** #382 sketched one
-- (`AND transferred_amount < <what is owed>`), and it would have to restate
-- the settlement base — `cfdi_total` when there is one, `amount` when the CFDI
-- is cancelled or absent. That base already exists once, in
-- `expectedSettlementAmount`, and a second copy in PL/pgSQL is exactly the
-- shape that manufactured a centavo out of nothing in #341. It would also
-- refuse the overpayment the confirm path deliberately supports (#81). The
-- route refuses a settled cobro with `PAYMENT_ALREADY_SETTLED` before it gets
-- here, and the replay guard the precondition was meant to preserve is a
-- different mechanism entirely: `uq_milestone_payments_declaration_reference`
-- already makes the same clave de rastreo twice a `23505`.
--
-- `tracking_reference` keeps being overwritten with the newest declaration's:
-- the milestone carries one column and the latest wire is the least-wrong
-- single value to show the owner. Every clave is preserved on its own ledger
-- row, which is what a complemento de pago is filed from.
--
-- CREATE OR REPLACE with the identical signature, so the REVOKE/GRANT applied
-- by the previous migration carries over; they are restated below anyway
-- because a function replaced under a different owner would not (#76).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_milestone_payment(
  p_milestone_id uuid,
  p_organization_id uuid,
  p_amount numeric,
  p_source text,
  p_tracking_reference text,
  p_receipt_url text
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'record_milestone_payment: amount must be greater than zero'
      USING ERRCODE = '22023';
  END IF;

  -- Scoped by organization_id as well as id (hard rule #4), and the status
  -- filter rides inside the write so a concurrent submission cannot land on a
  -- row another request confirmed in the meantime.
  --
  -- `marked_paid → marked_paid` is a no-op on the status and the point of this
  -- migration: the second declaration adds to the total and appends its own
  -- ledger row, rather than being refused.
  --
  -- `receipt_url` is written only when this declaration carries one (#339): a
  -- receipt-less declaration must not erase the comprobante the owner filed on
  -- the client's behalf.
  UPDATE public.milestones
     SET status             = 'marked_paid',
         tracking_reference = p_tracking_reference,
         receipt_url        = COALESCE(p_receipt_url, receipt_url),
         transferred_amount = COALESCE(transferred_amount, 0) + p_amount
   WHERE id              = p_milestone_id
     AND organization_id = p_organization_id
     AND status IN ('pending', 'requested', 'marked_paid')
   RETURNING transferred_amount INTO v_total;

  -- Zero rows matched: the milestone is confirmed, or it is not this
  -- organization's. NULL tells the caller to answer 409 rather than 200 — and
  -- because this is one transaction, no ledger row is left behind for a
  -- declaration that was refused.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.milestone_payments
    (milestone_id, organization_id, amount, source, tracking_reference, receipt_url)
  VALUES
    (p_milestone_id, p_organization_id, p_amount, p_source, p_tracking_reference, p_receipt_url);

  RETURN v_total;
END;
$$;

-- PostgREST publishes every executable function in `public` at
-- /rest/v1/rpc/<name>, and Supabase grants EXECUTE to anon and authenticated as
-- *named roles* — `REVOKE … FROM PUBLIC` does not touch those (#76). Without
-- this, any visitor could mark any milestone paid for any amount.
REVOKE ALL ON FUNCTION public.record_milestone_payment(uuid, uuid, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_milestone_payment(uuid, uuid, numeric, text, text, text)
  TO service_role;

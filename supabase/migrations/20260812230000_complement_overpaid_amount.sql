-- #81 — an overpaid PPD milestone was silently clamped; the surplus was
-- recorded nowhere.
--
-- `planPaymentComplement` caps the declared payment at the outstanding balance
-- (ImpPagado may not exceed ImpSaldoAnt — the clamp is the correct fiscal
-- treatment under Pagos 2.0), but a client who transferred $10,500 against a
-- $10,000 balance had the extra $500 exist in the organization's bank account
-- and in no row of this database. Neither the tenant nor their accountant had
-- anything to reconcile against.
--
-- `overpaid_amount` records what arrived above the balance at the moment the
-- complement was planned:
--
--   * 0    — the payment fit the balance (the common case; written explicitly).
--   * >0   — the surplus the clamp removed; surfaced to the tenant as money to
--            apply to another charge or refund.
--   * NULL — a row from before this column existed, whose surplus is unknown.
--            Nullable with no default on purpose (#64's tri-state at the
--            column): backfilling 0 would invent the very fact that was lost.
--
-- As of 2026-08-12, `cfdi_payment_complements` holds 0 rows in production
-- (#81's verification pass) — no live rows take the NULL path today.

ALTER TABLE public.cfdi_payment_complements
  ADD COLUMN IF NOT EXISTS overpaid_amount numeric(12,2);

ALTER TABLE public.cfdi_payment_complements
  DROP CONSTRAINT IF EXISTS chk_complement_overpaid_amount;
ALTER TABLE public.cfdi_payment_complements
  ADD CONSTRAINT chk_complement_overpaid_amount
  CHECK (overpaid_amount IS NULL OR overpaid_amount >= 0);

COMMENT ON COLUMN public.cfdi_payment_complements.overpaid_amount IS
  'What the payment exceeded the outstanding balance by (#81); not declared in '
  'the complement (Pagos 2.0 caps ImpPagado at ImpSaldoAnt). NULL predates the column.';

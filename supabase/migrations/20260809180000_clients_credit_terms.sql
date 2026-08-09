-- The B2B trade-credit feature was built everywhere except the schema.
--
-- `types/database.ts` has declared clients.credit_limit / credit_days /
-- credit_status since the feature landed, ClientFormModal collects all three,
-- ClientCard renders a credit badge from them, QuoteWizardModal derives
-- `valid_until` from credit_days, and lib/clientCredit.ts computes a full
-- utilization summary — but no migration ever created the columns. Confirmed
-- absent in production while verifying #96's last exit criterion.
--
-- The consequences were two fabricated successes at once: the "Línea de Crédito
-- B2B" card on the client detail page showed every real client a $0 limit with
-- a green "Activo" badge (all three reads resolved to undefined, and the
-- summary defaulted status to 'active'), and every credit-limit the owner typed
-- into the form was stripped by CLIENT_WRITABLE_FIELDS and reported as saved.
-- Because the declared types said the columns existed, neither was a type error.
--
-- All three are NULLABLE with no default, and that is the point: NULL means
-- "no credit line has ever been configured", which the UI must render as
-- unknown rather than as an authorized limit of zero. A DEFAULT of 0/'active'
-- would re-create the exact fabrication this migration exists to remove — it
-- would make every client that has never been assessed look deliberately
-- assessed at zero. Unknown stays distinguishable from decided (#64's tri-state
-- rule, applied to a column instead of a hook).
-- numeric(12,2) matches every other money column in this schema (quotes,
-- contracts, milestones, products, complements).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_days integer;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_status text;

-- Money and terms cannot be negative. NULL still passes: these constrain the
-- configured values, they do not force configuration.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS chk_client_credit_limit_non_negative;
ALTER TABLE public.clients
  ADD CONSTRAINT chk_client_credit_limit_non_negative
  CHECK (credit_limit IS NULL OR credit_limit >= 0);

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS chk_client_credit_days_non_negative;
ALTER TABLE public.clients
  ADD CONSTRAINT chk_client_credit_days_non_negative
  CHECK (credit_days IS NULL OR credit_days >= 0);

-- The status vocabulary is enforced in the database, not only in TypeScript:
-- the summary branches on it to decide whether new quotes are allowed at all
-- (lib/clientCredit.ts validateQuoteCreditLimit), so an unrecognised value
-- must not be storable.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS chk_client_credit_status_valid;
ALTER TABLE public.clients
  ADD CONSTRAINT chk_client_credit_status_valid
  CHECK (credit_status IS NULL OR credit_status IN ('active', 'suspended', 'blocked'));

COMMENT ON COLUMN public.clients.credit_limit IS
  'Authorized B2B trade credit line in MXN. NULL = never configured; render as unknown, never as an authorized zero.';
COMMENT ON COLUMN public.clients.credit_days IS
  'Payment terms in days. NULL = never configured. 0 is a real answer meaning contado.';
COMMENT ON COLUMN public.clients.credit_status IS
  'active | suspended | blocked. NULL = never configured; do not default to active in the UI.';

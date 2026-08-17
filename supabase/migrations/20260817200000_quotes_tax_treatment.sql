-- ----------------------------------------------------------------------------
-- quotes.tax_treatment — the tenant states the tax category, we stop guessing
-- (#407)
--
-- The quote wizard had a single IVA checkbox, so a quote carried exactly two
-- states: 16% IVA, or `iva_amount = 0`. CFDI 4.0 does not have two states. SAT
-- Anexo 20's `TipoFactor` distinguishes:
--
--   * **Tasa** at 0.160000 — the ordinary case.
--   * **Tasa** at 0.000000 — the sale IS subject to IVA, at zero. Exports,
--     basic foodstuffs, medicine, agricultural products.
--   * **Exento** — the sale is outside IVA entirely. Medical and educational
--     services, some rentals, books.
--
-- `iva_amount = 0` covered the last two indistinguishably, so the CFDI payload
-- had to guess. It guessed zero-rate — deliberately, because both charge the
-- client the same and neither risks the 16% overcharge that #347 closed, but a
-- guess on a fiscal document is a guess: a CFDI cannot be edited, only cancelled
-- with a motivo, and the misclassification is visible to the client's
-- accountant and to the SAT.
--
-- The founder chose (2026-08-17, on #407) to ask on the quote rather than infer.
-- This column is where the answer lives.
--
-- **Nullable with NO DEFAULT, deliberately.** NULL means "this quote predates
-- the question" and must stay distinguishable from a tenant who chose — the
-- #64 tri-state rule at the column. `deriveCFDITaxTreatment` reads NULL as
-- "fall back to inferring from `iva_amount`", which is exactly the behaviour
-- every existing quote has today, so no stamped document changes meaning and no
-- backfill is required.
--
-- **Expected rows changed by this migration: zero** (#128 — a backfill's guard
-- is a claim about rows, so the absence of a backfill is stated rather than
-- implied). `ADD COLUMN` with no default fills existing rows with NULL, which
-- is the intended value for every one of them. There are 2 quotes in production
-- at the time of writing; both should read NULL afterwards.
--
-- The CHECK carries the `chk_` prefix per CLAUDE.md. The vocabulary exists in
-- exactly one other place — `QUOTE_TAX_TREATMENTS` in `lib/quoteCalculator.ts`,
-- with a `normalizeQuoteTaxTreatment` that returns NULL for anything it does not
-- recognise rather than the nearest listed value (#95/#116: a `'free'` mapped to
-- the nearest tier is how unpaid tenants were shown a $299 plan).
-- ----------------------------------------------------------------------------

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tax_treatment text;

COMMENT ON COLUMN public.quotes.tax_treatment IS
  'SAT tax category the tenant stated for this quote: iva_16 | tasa_0 | exento. NULL = the quote predates the question, so the CFDI payload infers from iva_amount (#407).';

-- Idempotent by convention: the constraint is dropped before it is added, so
-- re-running the file against a database that already has it is a no-op rather
-- than a `42710`.
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS chk_quotes_tax_treatment;

ALTER TABLE public.quotes
  ADD CONSTRAINT chk_quotes_tax_treatment
  CHECK (tax_treatment IS NULL OR tax_treatment IN ('iva_16', 'tasa_0', 'exento'));

-- No RLS change. The existing `quotes` policies are scoped by organization and
-- say nothing about this column, which is correct.
--
-- No index. The column is read when a quote is opened or stamped — always by
-- primary key or already filtered by organization — and never used as a lookup
-- or filter predicate. An index on a column nothing searches is the wrong trade
-- (same reasoning as the archived-clients list in 20260814080000).

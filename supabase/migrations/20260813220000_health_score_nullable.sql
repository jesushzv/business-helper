-- #276 — a client with no payment history has no health score.
--
-- The column was `int4 NOT NULL DEFAULT 100`, and the insert route wrote 100
-- explicitly besides, so every brand-new client rendered "Excelente (100)" on
-- the surfaces where credit is decided. HealthScoreMeter was built (#108) to
-- render "Sin historial" for a null score — a state this column could never
-- produce.
--
-- Idempotent by convention. The CHECK (0..100) stays: it constrains values,
-- and a NULL passes a CHECK by SQL semantics, so it needs no change.

ALTER TABLE public.clients ALTER COLUMN health_score DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN health_score DROP DEFAULT;

-- Backfill: every stored 100 with no confirmed payment behind it is the
-- hardcoded insert value, not a judgment anyone made — nothing in the product
-- has ever computed or written any other score. Scores that are NOT 100 (none
-- should exist; belt and braces) and clients with at least one confirmed
-- payment keep their value.
--
-- Per LESSONS (#128): state the expected count and read it back. Expected: on
-- a deployment where no client has confirmed payments, every row updates; rows
-- with confirmed milestones through their contracts are left alone.
UPDATE public.clients c
SET health_score = NULL
WHERE c.health_score = 100
  AND NOT EXISTS (
    SELECT 1
    FROM public.contracts ct
    JOIN public.milestones m ON m.contract_id = ct.id
    WHERE ct.client_id = c.id
      AND m.status = 'confirmed'
  );

-- ----------------------------------------------------------------------------
-- Deletion invariants at the database layer, part 1 of 2: two FK RESTRICTs (#336)
--
-- Implements sub-decisions 1 and 2 of #328. #327 made record deletion
-- capability-gated and guarded, but every one of those protections lives in
-- the app layer, where a check and the DELETE it guards are two statements
-- with a window between them.
--
-- 1. contracts.quote_id: ON DELETE SET NULL -> RESTRICT
--
--    The app-level pre-check in app/api/quotes/[id]/route.ts looks for a
--    contract on the quote and 409s. A conversion completing *between* that
--    read and the DELETE still orphans the contract: the /pay/[token] walk
--    (quotes.public_token -> contract) dies, and the #218 resume lookup, keyed
--    on contracts.quote_id, can never find it again.
--
--    Converted quotes are already undeletable at the app layer, so SET NULL
--    now only ever fires in exactly these broken states. RESTRICT loses
--    nothing anyone intended.
--
-- 2. cfdi_stamp_claims.milestone_id: ON DELETE CASCADE -> RESTRICT
--
--    #327 pre-checks the claim, but a claim inserted *after* that read still
--    cascades away. In the window between the claim insert and the
--    cfdi_status flip (app/api/invoices/issue/route.ts), a concurrent delete
--    removes milestone + claim, the issue route's subsequent updates match 0
--    rows with no error, and the PAC stamps — a live SAT document with no
--    milestone row and no reconciliation anchor.
--
--    RESTRICT makes any held claim — in flight, or kept after a timeout,
--    which is exactly when a document may exist — block the deletion
--    atomically.
--
-- Both constraints were created inline with REFERENCES, so their names are
-- whatever Postgres generated. They are looked up by (table, column) rather
-- than assumed, and recreated under an explicit name so the next migration
-- that needs them does not have to guess either.
-- ----------------------------------------------------------------------------

-- 1. contracts.quote_id -> RESTRICT
DO $$
DECLARE
  existing_name text;
BEGIN
  SELECT con.conname INTO existing_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'contracts'
    AND con.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.contracts'::regclass AND attname = 'quote_id')
    ]::smallint[];

  IF existing_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.contracts DROP CONSTRAINT %I', existing_name);
  END IF;

  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_quote_id_fkey
    FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE RESTRICT;
END $$;

-- 2. cfdi_stamp_claims.milestone_id -> RESTRICT
DO $$
DECLARE
  existing_name text;
BEGIN
  SELECT con.conname INTO existing_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'cfdi_stamp_claims'
    AND con.conkey = ARRAY[
      (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.cfdi_stamp_claims'::regclass AND attname = 'milestone_id')
    ]::smallint[];

  IF existing_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cfdi_stamp_claims DROP CONSTRAINT %I', existing_name);
  END IF;

  ALTER TABLE public.cfdi_stamp_claims
    ADD CONSTRAINT cfdi_stamp_claims_milestone_id_fkey
    FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE RESTRICT;
END $$;

-- Several settlement accounts per organization, chosen per quote (#164).
--
-- Until now an organization settled at exactly one account: three `bank_*`
-- columns on `organizations`. That was a deliberate boundary (recorded in
-- docs/02-architecture/database-schema-design.md), taken because no tenant had
-- needed a second account. One now does, so the boundary moves.
--
-- Shape:
--   - `bank_accounts` holds the accounts, one row flagged `is_default`.
--   - `quotes.bank_account_id` records the account a given quote's client pays
--     into; NULL means "whatever the organization's default is", which is what
--     every quote written before this migration means.
--   - Accounts are **archived, never deleted**: a quote that has already been
--     sent names the account its client was told to pay, and rewriting that
--     retroactively would falsify a money record. `ON DELETE RESTRICT` on the
--     quote FK enforces that even against a hand-run DELETE.
--
-- The legacy `organizations.bank_*` columns are deliberately NOT dropped here.
-- Vercel deploys `main` the moment it merges while migrations are applied by
-- hand (hard rule #6), so the old code must keep working against this schema
-- between the two events. Dropping them is a later migration, once no code
-- reads them.

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- What the owner calls it ("BBVA obra", "Santander nómina"). Distinguishing
  -- two 18-digit strings by sight is exactly the mistake this feature invites.
  label text NOT NULL,
  bank_name text NOT NULL,
  clabe text NOT NULL,
  account_holder text,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Same rule the API and `lib/clabe.ts` enforce; the column is the last line of
-- defence for a value real money is wired to.
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS chk_bank_accounts_clabe_format;
ALTER TABLE public.bank_accounts
  ADD CONSTRAINT chk_bank_accounts_clabe_format CHECK (clabe ~ '^[0-9]{18}$');

-- An archived account cannot also be the one new quotes default to.
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS chk_bank_accounts_archived_not_default;
ALTER TABLE public.bank_accounts
  ADD CONSTRAINT chk_bank_accounts_archived_not_default
  CHECK (NOT (is_default AND archived_at IS NOT NULL));

ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS chk_bank_accounts_label_present;
ALTER TABLE public.bank_accounts
  ADD CONSTRAINT chk_bank_accounts_label_present CHECK (length(trim(label)) > 0);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_organization_id
  ON public.bank_accounts (organization_id);

-- At most one default per organization. Partial on `archived_at IS NULL` so an
-- archived row can never hold the slot, and enforced in the database rather
-- than by the route: "which account does money go to" must not depend on which
-- request won a race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_default_per_org
  ON public.bank_accounts (organization_id)
  WHERE is_default AND archived_at IS NULL;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Matches the pattern every tenant table uses, with WITH CHECK stated
-- explicitly rather than left to inherit from USING — an INSERT that names
-- another tenant's organization_id must be refused on the way in, not only
-- filtered on the way out.
DROP POLICY IF EXISTS "Tenant members access organization bank accounts" ON public.bank_accounts;
CREATE POLICY "Tenant members access organization bank accounts"
  ON public.bank_accounts
  FOR ALL
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

-- Which account this quote's client was told to pay. NULL = the organization's
-- default at render time, which is what every pre-existing quote means.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_quotes_bank_account_id
  ON public.quotes (bank_account_id);

-- Backfill: every organization that already has a valid CLABE gets it as its
-- default account, so the gate in lib/settlementAccount.ts keeps answering the
-- same thing for the same tenants across the cutover. Guarded on the row not
-- already existing so re-running cannot mint a duplicate.
INSERT INTO public.bank_accounts (organization_id, label, bank_name, clabe, account_holder, is_default)
SELECT
  o.id,
  COALESCE(NULLIF(trim(o.bank_name), ''), 'Cuenta principal'),
  COALESCE(NULLIF(trim(o.bank_name), ''), 'Banco'),
  o.bank_clabe,
  o.bank_account_holder,
  true
FROM public.organizations o
WHERE o.bank_clabe ~ '^[0-9]{18}$'
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_accounts ba WHERE ba.organization_id = o.id
  );

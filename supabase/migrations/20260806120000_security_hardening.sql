-- ============================================================================
-- Business Helper — P0 Security Hardening
-- Migration: 20260806120000_security_hardening.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- Addresses four critical findings:
--   P0-1  Forgeable OTP e-signature (plaintext codes, no expiry, no binding)
--   P0-2  Unverified Stripe webhooks (no idempotency ledger)
--   P0-3  Tautological anon RLS policies leaking every tenant's data
--   P0-4  Hardcoded CLABE in the live payment path
-- ============================================================================

-- ----------------------------------------------------------------------------
-- P0-3. Remove the anon-readable policies
--
-- "Public read quotes via public_token" was USING (public_token IS NOT NULL).
-- public_token is NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'), so the
-- predicate is true for every row: the anon key returned all tenants' quotes.
--
-- "Public read contracts for OTP signing" was USING (status IN (...)), which is
-- likewise unscoped and exposed client_otp_code in plaintext.
--
-- Public token access now goes exclusively through the service-role client in
-- lib/supabase/service.ts, which filters by the exact token server-side.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read quotes via public_token" ON public.quotes;
DROP POLICY IF EXISTS "Public read contracts for OTP signing" ON public.contracts;

-- Revoke the blanket table grants the anon role inherits by default, so a
-- future policy added without care cannot silently re-open the same hole.
REVOKE ALL ON public.quotes FROM anon;
REVOKE ALL ON public.contracts FROM anon;
REVOKE ALL ON public.milestones FROM anon;
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.organizations FROM anon;

-- ----------------------------------------------------------------------------
-- P0-1. Server-authoritative OTP state on quotes
--
-- The signing route operates on quotes by public_token but quotes had no OTP
-- columns at all, which is why the route accepted the expected code from the
-- request body. Codes are stored as keyed HMAC-SHA256 digests (never plaintext)
-- and are bound to a single quote with a hard expiry and a server-side attempt
-- counter.
-- ----------------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_otp_hash text,
  ADD COLUMN IF NOT EXISTS client_otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_otp_attempts int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_otp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_otp_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_hash text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS accepted_ip text;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS chk_quote_otp_attempts_limit;
ALTER TABLE public.quotes
  ADD CONSTRAINT chk_quote_otp_attempts_limit
  CHECK (client_otp_attempts BETWEEN 0 AND 5);

-- Contracts: migrate off plaintext OTP storage to the same hashed scheme.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_otp_hash text,
  ADD COLUMN IF NOT EXISTS client_otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_otp_sent_at timestamptz;

-- Any code already sitting in the plaintext column is unrecoverable as a hash
-- and must not survive the migration. Clearing it forces a fresh, hashed
-- issue. Guarded so a re-apply after the column is gone is a no-op (#35).
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'client_otp_code'
  ) THEN
    UPDATE public.contracts SET client_otp_code = NULL WHERE client_otp_code IS NOT NULL;
  END IF;
END
$$;
ALTER TABLE public.contracts DROP COLUMN IF EXISTS client_otp_code;

-- ----------------------------------------------------------------------------
-- P0-4. Per-organization bank details
--
-- The public payment path served a single hardcoded CLABE
-- (012180001234567890) to every tenant's customers, so funds owed to any
-- organization were directed to one fixed account. Each org now carries its
-- own settlement details and the payment page resolves them per quote.
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_clabe text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_org_bank_clabe_format;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_org_bank_clabe_format
  CHECK (bank_clabe IS NULL OR bank_clabe ~ '^[0-9]{18}$');

-- The tier rename (emprendedor -> inicial) landed in application code but never
-- in the CHECK constraint, so every webhook write of the renamed tier failed at
-- the database while the route reported success. Accept both spellings.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_subscription_tier;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_subscription_tier
  CHECK (subscription_tier IN ('free', 'inicial', 'emprendedor', 'negocio', 'empresa'));

-- Stripe reports statuses the original constraint rejected (trialing, unpaid,
-- incomplete), which likewise failed the write after the route had 200'd.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS chk_subscription_status;
ALTER TABLE public.organizations
  ADD CONSTRAINT chk_subscription_status
  CHECK (subscription_status IN (
    'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired'
  ));

-- ----------------------------------------------------------------------------
-- P0-2. Stripe webhook idempotency ledger
--
-- Stripe retries deliveries; without a ledger a replayed (or duplicated)
-- subscription event re-applies a tier change. The primary key on the Stripe
-- event id makes reprocessing a no-op.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_org
  ON public.stripe_webhook_events (organization_id);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policy is defined on purpose: the ledger is written only by the
-- service-role client in the webhook route, which bypasses RLS. With RLS on and
-- zero policies, anon and authenticated roles can neither read nor write it.

-- ----------------------------------------------------------------------------
-- Supporting indexes for the token lookups the service-role client performs
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON public.quotes (public_token);

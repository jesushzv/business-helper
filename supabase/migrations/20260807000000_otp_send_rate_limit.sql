-- ============================================================================
-- Business Helper — Per-recipient OTP send ledger
-- Migration: 20260807000000_otp_send_rate_limit.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- POST /api/quotes/public/[token]/otp is public by design — the signer is not
-- logged in and the quote token is the only credential. Its only bound on
-- issuance was a 30s cooldown keyed on quotes.client_otp_sent_at, which is
-- per quote. A client with several open quotes has several valid tokens all
-- resolving to the same clients.phone, so anyone holding them could cycle
-- between quotes and mint a code on every request: each quote carries its own
-- client_otp_sent_at, and no cooldown ever applied.
--
-- Every send is a billable Twilio/Meta message, so that is a cost channel as
-- well as an abuse one, and on SMS it is the shape carriers flag as pumping.
--
-- The limit has to live outside the request that issues the code: Vercel
-- functions share no memory, so an in-process counter would not survive an
-- invocation and would not actually limit anything. This ledger is that
-- shared state — one row per issued code, keyed on the recipient phone rather
-- than on the quote.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The rate limit key: the recipient in E.164, normalized server-side from
  -- clients.phone. Storing the normalized form is what makes two quotes that
  -- spell the same number differently ("8115559988", "+528115559988") count
  -- against one budget.
  phone_e164 text NOT NULL,

  -- Nullable, and SET NULL rather than CASCADE on purpose: deleting a quote
  -- must not erase the evidence that its codes went to a phone, or deleting
  -- one would hand back that phone's hourly budget.
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,

  channel text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_otp_send_log_phone_e164 CHECK (phone_e164 ~ '^\+[0-9]{10,15}$')
);

-- The hourly window query: rows for one phone since a cutoff, oldest first.
CREATE INDEX IF NOT EXISTS idx_otp_send_log_phone_created
  ON public.otp_send_log (phone_e164, created_at);

-- The per-quote lifetime count.
CREATE INDEX IF NOT EXISTS idx_otp_send_log_quote
  ON public.otp_send_log (quote_id);

ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY;

-- No policy, deliberately, exactly as with stripe_webhook_events: the ledger is
-- written and read only by the service-role client in the OTP route, which
-- bypasses RLS. With RLS enabled and zero policies, anon and authenticated can
-- neither read it (it is a list of customers' phone numbers) nor write it (a
-- forged row would consume someone else's budget, or an erased one would
-- refund an attacker's).
REVOKE ALL ON public.otp_send_log FROM anon;
REVOKE ALL ON public.otp_send_log FROM authenticated;

-- Retention: rows older than the widest limit window are only ballast. The
-- per-quote lifetime cap still reads history for quotes that remain signable,
-- so prune conservatively rather than by the hourly window:
--
--   DELETE FROM public.otp_send_log WHERE created_at < now() - interval '30 days';
